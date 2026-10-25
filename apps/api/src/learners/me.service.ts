import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { RateLimiterService } from '../common/rate-limiter.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import type { MeDto, UpdateProfileDto } from './dto/me.dto.js';

// Stops guessing batch codes (FR-106).
const BATCH_JOIN_LIMIT = { name: 'batch-join', max: 10, windowSeconds: 3600 };

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiterService,
  ) {}

  async get(userId: string): Promise<MeDto> {
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: true,
        enrolments: {
          where: { leftAt: null },
          include: { batch: { select: { code: true, name: true } } },
        },
      },
    });
    const enrolment = user.enrolments[0];
    return {
      id: user.id,
      role: user.role,
      uiLocale: user.uiLocale,
      firstName: user.firstName,
      lastName: user.lastName,
      profile: user.profile && {
        districtCode: user.profile.districtCode,
        tradeCode: user.profile.tradeCode,
        targetJob: user.profile.targetJob,
        selfDeclaredLevel: user.profile.selfDeclaredLevel,
      },
      batch: enrolment
        ? {
            code: enrolment.batch.code,
            name: enrolment.batch.name,
            enrolledAt: enrolment.enrolledAt,
          }
        : null,
      onboarding: { profileComplete: user.profile !== null, batchJoined: enrolment !== undefined },
    };
  }

  /** FR-102: change the interface language at any time. */
  async setLocale(userId: string, locale: string): Promise<MeDto> {
    await this.prisma.db.user.update({ where: { id: userId }, data: { uiLocale: locale } });
    return this.get(userId);
  }

  /** FR-103 (and FR-802 edits): name on the user, the rest on the learner profile. */
  async setProfile(userId: string, dto: UpdateProfileDto): Promise<MeDto> {
    const [district, trade] = await Promise.all([
      this.prisma.db.district.findUnique({ where: { code: dto.districtCode } }),
      this.prisma.db.trade.findUnique({ where: { code: dto.tradeCode } }),
    ]);
    if (!district || !trade) {
      throw new ApiError(400, 'unknown_reference', {
        fields: [!district && 'districtCode', !trade && 'tradeCode'].filter(Boolean),
      });
    }
    const profile = {
      districtCode: dto.districtCode,
      tradeCode: dto.tradeCode,
      targetJob: dto.targetJob?.trim() || null,
      selfDeclaredLevel: dto.selfDeclaredLevel,
    };
    await this.prisma.db.$transaction([
      this.prisma.db.user.update({
        where: { id: userId },
        data: { firstName: dto.firstName.trim(), lastName: dto.lastName?.trim() || null },
      }),
      this.prisma.db.learnerProfile.upsert({
        where: { userId },
        create: { userId, ...profile },
        update: profile,
      }),
    ]);
    return this.get(userId);
  }

  /** FR-106: join a batch by code. Joining another batch ends the current enrolment. */
  async joinBatch(userId: string, rawCode: string): Promise<MeDto> {
    await this.limiter.hit(BATCH_JOIN_LIMIT, userId);
    const code = rawCode.trim().toUpperCase();
    const batch = await this.prisma.db.batch.findUnique({ where: { code } });
    if (!batch) throw new ApiError(404, 'batch_not_found');
    if (batch.status !== 'active') throw new ApiError(409, 'batch_closed');

    await this.prisma.db.$transaction(async (tx) => {
      const current = await tx.enrolment.findFirst({ where: { learnerId: userId, leftAt: null } });
      if (current?.batchId === batch.id) return;
      if (current)
        await tx.enrolment.update({ where: { id: current.id }, data: { leftAt: new Date() } });
      await tx.enrolment.create({ data: { learnerId: userId, batchId: batch.id, source: 'code' } });
    });
    return this.get(userId);
  }
}
