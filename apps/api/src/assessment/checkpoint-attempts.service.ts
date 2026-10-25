import { Injectable } from '@nestjs/common';
import type { CheckpointShape } from '@tomcom/content-schema';
import { AuditService } from '../audit/audit.service.js';
import { batchScope } from '../admin/scope.js';
import { ApiError } from '../common/api-error.js';
import { RateLimiterService } from '../common/rate-limiter.service.js';
import type { LevelCode, Prisma } from '../generated/prisma/client.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { draw, isCorrect, overall, wordCount } from './scoring.js';

/** An attempt must be submitted within this time. */
const ATTEMPT_MINUTES = 90;
/** Learners may start at most this many attempts per level per day [A]. */
const ATTEMPT_LIMIT = { name: 'checkpoint-attempt', max: 3, windowSeconds: 86_400 };

type Item = CheckpointShape['sections']['reading'][number];
type Task = CheckpointShape['sections']['writing'][number] & {
  prompt: Record<string, string>;
  explanation: Record<string, string>;
};
interface Drawn {
  reading: Item[];
  listening: Item[];
  writing: Task[];
}
interface Responses {
  answers: Record<string, unknown>;
  writing: Record<string, string>;
}

/** What the learner sees: questions without answer keys or explanations. */
const publicItem = ({ answer: _a, explanation: _e, ...q }: Item & { explanation?: unknown }) => q;
const publicTask = ({ explanation: _e, ...t }: Task) => t;

/**
 * FR-404 checkpoint attempts (ADR-009): drawn and scored on the server, online only. Reading
 * and listening are scored at once; writing waits for a trainer (FR-407 trainer marking).
 */
@Injectable()
export class CheckpointAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiterService,
    private readonly audit: AuditService,
  ) {}

  /** Per level: published?, eligible (every published lesson passed)?, and the latest attempt. */
  async overview(learnerId: string) {
    const levels = await this.prisma.db.level.findMany({
      orderBy: { order: 'asc' },
      include: {
        checkpoint: { select: { publishedRevision: true } },
        lessons: { where: { publishedRevision: { not: null } }, select: { id: true } },
      },
    });
    const passed = new Set(
      (
        await this.prisma.db.lessonProgress.findMany({
          where: { learnerId, passed: true },
          select: { lessonId: true },
        })
      ).map((p) => p.lessonId),
    );
    const attempts = await this.prisma.db.checkpointAttempt.findMany({
      where: { learnerId },
      orderBy: { startedAt: 'desc' },
    });
    return levels.map((l) => {
      const latest = attempts.find((a) => a.levelId === l.id);
      return {
        level: l.code,
        available: l.checkpoint?.publishedRevision != null,
        lessons: l.lessons.length,
        lessonsPassed: l.lessons.filter((x) => passed.has(x.id)).length,
        eligible: l.lessons.length > 0 && l.lessons.every((x) => passed.has(x.id)),
        passed: attempts.some((a) => a.levelId === l.id && a.status === 'passed'),
        latest: latest ? this.summary(latest) : null,
      };
    });
  }

  private summary(a: {
    id: string;
    status: string;
    total: number | null;
    sectionScores: Prisma.JsonValue;
    passMark: number;
    startedAt: Date;
    submittedAt: Date | null;
  }) {
    return {
      id: a.id,
      status: a.status,
      total: a.total,
      sectionScores: (a.sectionScores as Record<string, number> | null) ?? null,
      passMark: a.passMark,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
    };
  }

  async start(learnerId: string, level: LevelCode) {
    const row = (await this.overview(learnerId)).find((o) => o.level === level)!;
    if (!row.available) throw new ApiError(404, 'checkpoint_not_available');
    if (!row.eligible) {
      throw new ApiError(409, 'lessons_not_passed', {
        lessons: row.lessons,
        lessonsPassed: row.lessonsPassed,
      });
    }
    const levelRow = await this.prisma.db.level.findUniqueOrThrow({
      where: { code: level },
      include: { checkpoint: true },
    });
    const open = await this.prisma.db.checkpointAttempt.findFirst({
      where: {
        learnerId,
        levelId: levelRow.id,
        status: 'in_progress',
        expiresAt: { gt: new Date() },
      },
    });
    // Reopening the app resumes the same attempt instead of drawing a new one.
    if (open) return this.view(open.id, learnerId);
    await this.limiter.hit(ATTEMPT_LIMIT, `${learnerId}:${level}`);

    const cp = levelRow.checkpoint!;
    const content = cp.publishedContent as unknown as CheckpointShape;
    const items: Drawn = {
      reading: draw(content.sections.reading, content.draw.reading),
      listening: draw(content.sections.listening, content.draw.listening),
      writing: draw(content.sections.writing, content.draw.writing) as Task[],
    };
    const attempt = await this.prisma.db.checkpointAttempt.create({
      data: {
        learnerId,
        levelId: levelRow.id,
        checkpointRevision: cp.publishedRevision!,
        passMark: content.passMark,
        items: items as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + ATTEMPT_MINUTES * 60_000),
      },
    });
    return this.view(attempt.id, learnerId);
  }

  /** The attempt for the learner: questions without answers while open; the result after. */
  async view(id: string, learnerId: string) {
    const a = await this.prisma.db.checkpointAttempt.findFirst({
      where: { id, learnerId },
      include: { level: { select: { code: true } } },
    });
    if (!a) throw new ApiError(404, 'attempt_not_found');
    const items = a.items as unknown as Drawn;
    return {
      ...this.summary(a),
      level: a.level.code,
      expiresAt: a.expiresAt,
      sections:
        a.status === 'in_progress'
          ? {
              reading: items.reading.map(publicItem),
              listening: items.listening.map(publicItem),
              writing: items.writing.map(publicTask),
            }
          : null,
    };
  }

  /** The recordings of an open attempt's listening questions, and nothing else. */
  async mediaFor(id: string, learnerId: string, mediaId: string): Promise<void> {
    const a = await this.prisma.db.checkpointAttempt.findFirst({ where: { id, learnerId } });
    const items = a?.items as unknown as Drawn | undefined;
    const allowed = [...(items?.reading ?? []), ...(items?.listening ?? [])].some(
      (q) => q.payload.audio === mediaId,
    );
    if (!a || !allowed) throw new ApiError(404, 'media_not_found');
  }

  async submit(id: string, learnerId: string, responses: Responses) {
    const a = await this.prisma.db.checkpointAttempt.findFirst({ where: { id, learnerId } });
    if (!a) throw new ApiError(404, 'attempt_not_found');
    if (a.status !== 'in_progress') throw new ApiError(409, 'attempt_closed');
    if (a.expiresAt < new Date()) {
      await this.prisma.db.checkpointAttempt.update({ where: { id }, data: { status: 'expired' } });
      throw new ApiError(409, 'attempt_expired');
    }
    const items = a.items as unknown as Drawn;
    for (const t of items.writing) {
      const words = wordCount(responses.writing[t.id] ?? '');
      if (words < t.payload.minWords || words > t.payload.maxWords) {
        throw new ApiError(400, 'writing_length', {
          taskId: t.id,
          minWords: t.payload.minWords,
          maxWords: t.payload.maxWords,
          words,
        });
      }
    }
    const score = (qs: Item[]) =>
      qs.length === 0
        ? 0
        : qs.filter((q) => isCorrect(q.type, q.answer, responses.answers[q.id])).length / qs.length;
    const sectionScores: Record<string, number> = {
      reading: score(items.reading),
      listening: score(items.listening),
    };
    const needsMarking = items.writing.length > 0;
    const total = needsMarking ? null : overall(sectionScores);
    const kept: Responses = {
      answers: Object.fromEntries(
        [...items.reading, ...items.listening].map((q) => [q.id, responses.answers[q.id] ?? null]),
      ),
      writing: Object.fromEntries(items.writing.map((t) => [t.id, responses.writing[t.id] ?? ''])),
    };
    await this.prisma.db.checkpointAttempt.update({
      where: { id },
      data: {
        responses: kept as unknown as Prisma.InputJsonValue,
        sectionScores,
        total,
        status: needsMarking ? 'awaiting_marking' : total! >= a.passMark ? 'passed' : 'failed',
        submittedAt: new Date(),
      },
    });
    return this.view(id, learnerId);
  }

  // ── Trainer marking of writing (portal) ──

  async markingQueue(auth: AccessClaims) {
    const scope = await batchScope(this.prisma, auth);
    const rows = await this.prisma.db.checkpointAttempt.findMany({
      where: {
        status: 'awaiting_marking',
        ...(scope
          ? { learner: { enrolments: { some: { leftAt: null, batchId: { in: scope } } } } }
          : {}),
      },
      orderBy: { submittedAt: 'asc' },
      take: 100,
      include: {
        level: { select: { code: true } },
        learner: {
          select: {
            firstName: true,
            lastName: true,
            enrolments: { where: { leftAt: null }, select: { batch: { select: { code: true } } } },
          },
        },
      },
    });
    return rows.map((a) => {
      const items = a.items as unknown as Drawn;
      const responses = a.responses as unknown as Responses;
      return {
        id: a.id,
        level: a.level.code,
        learnerName: [a.learner.firstName, a.learner.lastName].filter(Boolean).join(' '),
        batchCode: a.learner.enrolments[0]?.batch.code ?? null,
        submittedAt: a.submittedAt,
        sectionScores: a.sectionScores as Record<string, number>,
        passMark: a.passMark,
        tasks: items.writing.map((t) => ({
          id: t.id,
          prompt: t.prompt,
          guide: t.explanation,
          minWords: t.payload.minWords,
          maxWords: t.payload.maxWords,
          text: responses.writing[t.id] ?? '',
        })),
      };
    });
  }

  async mark(
    auth: AccessClaims,
    id: string,
    marks: Record<string, { score: number; comment?: string }>,
    ip?: string,
  ) {
    const queue = await this.markingQueue(auth);
    const entry = queue.find((q) => q.id === id);
    // Out of scope looks the same as missing or already marked (FR-908).
    if (!entry) throw new ApiError(404, 'attempt_not_found');
    for (const t of entry.tasks) {
      const m = marks[t.id];
      if (!m || typeof m.score !== 'number' || m.score < 0 || m.score > 1) {
        throw new ApiError(400, 'validation_failed', { taskId: t.id });
      }
    }
    const writing = entry.tasks.reduce((s, t) => s + marks[t.id]!.score, 0) / entry.tasks.length;
    const sectionScores = { ...entry.sectionScores, writing };
    const total = overall(sectionScores);
    const status = total >= entry.passMark ? 'passed' : 'failed';
    const updated = await this.prisma.db.checkpointAttempt.updateMany({
      where: { id, status: 'awaiting_marking' },
      data: {
        writingMarks: Object.fromEntries(
          entry.tasks.map((t) => [
            t.id,
            { score: marks[t.id]!.score, comment: (marks[t.id]!.comment ?? '').slice(0, 1000) },
          ]),
        ),
        sectionScores,
        total,
        status,
        markedBy: auth.userId,
        markedAt: new Date(),
      },
    });
    if (updated.count === 0) throw new ApiError(409, 'attempt_closed');
    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'checkpoint_mark',
      entityType: 'checkpoint_attempt',
      entityId: id,
      outcome: 'success',
      details: { status },
      ip,
    });
    return { id, status, total, sectionScores };
  }
}
