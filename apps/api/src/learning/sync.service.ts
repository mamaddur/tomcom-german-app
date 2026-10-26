import { Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { RateLimiterService } from '../common/rate-limiter.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import type { SyncRequestDto, SyncResponseDto } from './dto/sync.dto.js';

// The app syncs on start, after each quiz and on reconnect; this is far above normal use.
const SYNC_LIMIT = { name: 'sync', max: 120, windowSeconds: 3600 };
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3600_000;
const ACTIVITY_DAYS = 60;
// Lowest pass mark an admin can set (settings registry); a "pass" below it is not believed.
const MIN_PASS_MARK = 0.5;

const istDate = (t: number) => new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Offline-first sync (FR-307, FR-405, NFR-05). Lesson quizzes are scored on the phone
 * (ADR-009); the server keeps every attempt, the best result per lesson, and daily learning
 * time. Every write is idempotent, so the app can resend its whole outbox safely.
 */
@Injectable()
export class SyncService {
  private readonly log = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiterService,
  ) {}

  async sync(learnerId: string, dto: SyncRequestDto, now = new Date()): Promise<SyncResponseDto> {
    await this.limiter.hit(SYNC_LIMIT, learnerId);
    const latest = now.getTime() + DAY_MS;
    for (const a of dto.attempts) {
      if (Date.parse(a.finishedAt) > latest) {
        throw new ApiError(400, 'validation_failed', { field: 'attempts.finishedAt' });
      }
    }
    const earliest = istDate(now.getTime() - ACTIVITY_DAYS * DAY_MS);
    const tomorrow = istDate(latest);
    const activity = dto.activity.filter((d) => d.date >= earliest && d.date <= tomorrow);

    const known = new Set(
      (
        await this.prisma.db.lesson.findMany({
          where: { id: { in: [...new Set(dto.attempts.map((a) => a.lessonId))] } },
          select: { id: true },
        })
      ).map((l) => l.id),
    );
    // Attempts for lessons that no longer exist are dropped but reported as stored, so they
    // leave the phone's outbox instead of being resent forever.
    const attempts = dto.attempts.filter((a) => known.has(a.lessonId));
    if (attempts.length < dto.attempts.length) {
      this.log.warn(
        { dropped: dto.attempts.length - attempts.length },
        'attempts for unknown lessons',
      );
    }

    await this.prisma.db.$transaction(async (tx) => {
      await tx.quizAttempt.createMany({
        data: attempts.map((a) => ({
          clientId: a.id,
          learnerId,
          lessonId: a.lessonId,
          packVersion: a.packVersion,
          score: a.score,
          passed: a.passed && a.score >= MIN_PASS_MARK,
          durationMs: a.durationMs,
          answers: a.answers as object[],
          finishedAt: new Date(a.finishedAt),
        })),
        skipDuplicates: true,
      });
      // Best score wins and a pass is never undone (ADR-008).
      for (const a of attempts) {
        const passed = a.passed && a.score >= MIN_PASS_MARK;
        const passedAt = passed ? new Date(a.finishedAt) : null;
        await tx.$executeRaw`
          INSERT INTO lesson_progress (learner_id, lesson_id, best_score, passed, passed_at, updated_at)
          VALUES (${learnerId}::uuid, ${a.lessonId}::uuid, ${a.score}, ${passed}, ${passedAt}, now())
          ON CONFLICT (learner_id, lesson_id) DO UPDATE SET
            best_score = GREATEST(lesson_progress.best_score, EXCLUDED.best_score),
            passed = lesson_progress.passed OR EXCLUDED.passed,
            passed_at = COALESCE(lesson_progress.passed_at, EXCLUDED.passed_at),
            updated_at = now()`;
      }
      // The app sends its running total per day; the larger value wins.
      for (const d of activity) {
        await tx.$executeRaw`
          INSERT INTO daily_activity (learner_id, date, seconds, updated_at)
          VALUES (${learnerId}::uuid, ${d.date}::date, ${d.seconds}, now())
          ON CONFLICT (learner_id, date) DO UPDATE SET
            seconds = GREATEST(daily_activity.seconds, EXCLUDED.seconds),
            updated_at = now()`;
      }
    });

    const [lessons, days] = await Promise.all([
      this.prisma.db.lessonProgress.findMany({
        where: { learnerId },
        select: { lessonId: true, bestScore: true, passed: true },
      }),
      this.prisma.db.dailyActivity.findMany({
        where: { learnerId, date: { gte: new Date(`${earliest}T00:00:00Z`) } },
        orderBy: { date: 'asc' },
        select: { date: true, seconds: true },
      }),
    ]);
    return {
      stored: dto.attempts.map((a) => a.id),
      lessons,
      activity: days.map((d) => ({ date: d.date.toISOString().slice(0, 10), seconds: d.seconds })),
    };
  }
}
