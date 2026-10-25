import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PiiCryptoService } from '../common/pii-crypto.service.js';
import { RateLimiterService } from '../common/rate-limiter.service.js';
import { PrismaService } from '../infra/prisma.service.js';

// An export is a full copy of the learner's data; a few a day is plenty.
const EXPORT_LIMIT = { name: 'data-export', max: 5, windowSeconds: 86_400 };

/**
 * FR-804, DPDP Act 2023: a learner can download everything we hold about them and erase their
 * account. Erasure removes identity and profile at once. Quiz attempts, lesson results and
 * learning time stay under the now anonymous user id for aggregate statistics; that last point
 * is an [A] assumption awaiting TOMCOM's DPO (docs/open-questions.md).
 */
@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: PiiCryptoService,
    private readonly limiter: RateLimiterService,
    private readonly audit: AuditService,
  ) {}

  async export(userId: string, ip?: string) {
    await this.limiter.hit(EXPORT_LIMIT, userId);
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: true,
        consents: { orderBy: { grantedAt: 'asc' } },
        enrolments: { include: { batch: { select: { code: true, name: true } } } },
        devices: true,
        lessonProgress: true,
        quizAttempts: { orderBy: { finishedAt: 'asc' } },
        dailyActivity: { orderBy: { date: 'asc' } },
        checkpointAttempts: {
          orderBy: { startedAt: 'asc' },
          include: { level: { select: { code: true } } },
        },
      },
    });
    await this.audit.record({
      actorId: userId,
      actorRole: user.role,
      action: 'learner_data_export',
      entityType: 'user',
      entityId: userId,
      outcome: 'success',
      ip,
    });
    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        phone: this.crypto.decrypt(user.phoneEnc),
        firstName: user.firstName,
        lastName: user.lastName,
        language: user.uiLocale,
        createdAt: user.createdAt,
      },
      profile: user.profile && {
        district: user.profile.districtCode,
        trade: user.profile.tradeCode,
        targetJob: user.profile.targetJob,
        selfDeclaredLevel: user.profile.selfDeclaredLevel,
      },
      consents: user.consents.map((c) => ({
        noticeVersion: c.noticeVersion,
        purposes: c.purposes,
        language: c.locale,
        grantedAt: c.grantedAt,
        withdrawnAt: c.withdrawnAt,
      })),
      batches: user.enrolments.map((e) => ({
        code: e.batch.code,
        name: e.batch.name,
        joinedAt: e.enrolledAt,
        leftAt: e.leftAt,
      })),
      devices: user.devices.map((d) => ({
        platform: d.platform,
        appVersion: d.appVersion,
        firstSeen: d.createdAt,
        lastSeen: d.lastSeenAt,
      })),
      lessonResults: user.lessonProgress.map((p) => ({
        lessonId: p.lessonId,
        bestScore: p.bestScore,
        passed: p.passed,
        passedAt: p.passedAt,
      })),
      quizAttempts: user.quizAttempts.map((a) => ({
        lessonId: a.lessonId,
        score: a.score,
        passed: a.passed,
        durationMs: a.durationMs,
        answers: a.answers,
        finishedAt: a.finishedAt,
      })),
      checkpoints: user.checkpointAttempts.map((a) => ({
        level: a.level.code,
        status: a.status,
        total: a.total,
        sectionScores: a.sectionScores,
        writing: (a.responses as { writing?: unknown } | null)?.writing ?? null,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
      })),
      learningTime: user.dailyActivity.map((d) => ({
        date: d.date.toISOString().slice(0, 10),
        seconds: d.seconds,
      })),
    };
  }

  /** Erases the account now. The phone number can register again as a new learner. */
  async erase(userId: string, ip?: string): Promise<void> {
    const now = new Date();
    await this.prisma.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          phoneEnc: new Uint8Array(),
          phoneHmac: `erased:${userId}`,
          firstName: null,
          lastName: null,
          status: 'deleted',
        },
      });
      await tx.learnerProfile.deleteMany({ where: { userId } });
      // Devices go, and with them every refresh token: all sessions end.
      await tx.device.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.enrolment.updateMany({
        where: { learnerId: userId, leftAt: null },
        data: { leftAt: now },
      });
      // Consent records stay as evidence, marked withdrawn.
      await tx.consent.updateMany({
        where: { userId, withdrawnAt: null },
        data: { withdrawnAt: now },
      });
    });
    await this.audit.record({
      actorId: userId,
      actorRole: 'learner',
      action: 'learner_account_erased',
      entityType: 'user',
      entityId: userId,
      outcome: 'success',
      ip,
    });
  }
}
