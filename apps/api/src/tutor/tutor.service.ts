import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { RateLimiterService, type Limit } from '../common/rate-limiter.service.js';
import { LLM_PROVIDER, type LlmProvider } from '../adapters/llm/llm.provider.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RedisService } from '../infra/redis.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  TutorFlagQueueItemDto,
  TutorHistoryItemDto,
  TutorReplyDto,
  TutorSendDto,
} from './dto/tutor.dto.js';
import {
  buildSystemPrompt,
  checkInput,
  filterOutput,
  germanPhrases,
  istDay,
  nextIstMidnight,
  REFUSAL,
} from './tutor-guard.js';

/** Burst guard on top of the daily limit: a tutor reply takes time, so no one needs more. */
const BURST: Limit = { name: 'tutor-burst', max: 10, windowSeconds: 60 };
const FLAG_LIMIT: Limit = { name: 'tutor-flag', max: 30, windowSeconds: 3600 };
/** How many earlier messages go into the prompt. */
const HISTORY_TURNS = 10;
const MAX_MISTAKES = 5;
const MAX_REPLY_TOKENS = 400;
/** NFR-15: conversations are kept 90 days, then deleted. */
export const RETENTION_DAYS = 90;

@Injectable()
export class TutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly limiter: RateLimiterService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /** FR-601: one learner message in, one tutor reply out. */
  async send(userId: string, dto: TutorSendDto): Promise<TutorReplyDto> {
    await this.limiter.hit(BURST, userId);
    const verdict = checkInput(dto.text);
    if (!verdict.ok && verdict.reason === 'empty')
      throw new ApiError(400, 'validation_failed', { field: 'text' });
    if (!verdict.ok && verdict.reason === 'too_long') throw new ApiError(400, 'message_too_long');

    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { firstName: true, uiLocale: true },
    });
    const language = user.uiLocale === 'en' ? 'en' : 'te';
    const day = await this.takeDaily(userId);
    try {
      return await this.answer(userId, dto, verdict, user.firstName, language, day.remaining);
    } catch (e) {
      // A tutor that could not answer (no vendor, vendor down) does not use up the learner's day.
      await day.refund();
      throw e;
    }
  }

  private async answer(
    userId: string,
    dto: TutorSendDto,
    verdict: ReturnType<typeof checkInput>,
    firstName: string | null,
    language: 'te' | 'en',
    remaining: number,
  ): Promise<TutorReplyDto> {
    const unsafe = !verdict.ok;
    const text = verdict.ok ? verdict.text : dto.text.replace(/\s+/g, ' ').trim();
    const lesson = dto.lessonId
      ? await this.prisma.db.lesson.findUnique({
          where: { id: dto.lessonId },
          select: { title: true },
        })
      : null;
    const lessonTitle = lesson ? this.pick(lesson.title, language) : null;

    const earlier = await this.prisma.db.tutorMessage.findMany({
      where: { learnerId: userId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TURNS,
      select: { role: true, content: true },
    });
    await this.prisma.db.tutorMessage.create({
      data: {
        learnerId: userId,
        role: 'user',
        content: text,
        level: dto.level,
        lessonId: dto.lessonId ?? null,
      },
    });

    let reply: { text: string; filtered: boolean };
    let inputTokens = 0;
    let outputTokens = 0;
    if (unsafe) {
      // Unsafe input never reaches the model (FR-606).
      reply = { text: REFUSAL[language], filtered: true };
    } else {
      const llm = await this.llm.reply({
        system: buildSystemPrompt({
          firstName,
          level: dto.level,
          language,
          lessonTitle,
          recentMistakes: await this.recentMistakes(userId, language),
        }),
        messages: [
          ...earlier.reverse().map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: text },
        ],
        replyLanguage: language,
        maxTokens: MAX_REPLY_TOKENS,
      });
      reply = filterOutput(llm.text, language);
      inputTokens = llm.inputTokens;
      outputTokens = llm.outputTokens;
    }
    const saved = await this.prisma.db.tutorMessage.create({
      data: {
        learnerId: userId,
        role: 'assistant',
        content: reply.text,
        level: dto.level,
        lessonId: dto.lessonId ?? null,
        inputTokens,
        outputTokens,
        filtered: reply.filtered,
      },
    });
    return {
      id: saved.id,
      reply: reply.text,
      germanPhrases: germanPhrases(reply.text),
      remainingToday: remaining,
      demo: this.llm.demo,
      filtered: reply.filtered,
    };
  }

  /** The learner's conversation, oldest first (the last 50 messages). */
  async history(userId: string): Promise<TutorHistoryItemDto[]> {
    const rows = await this.prisma.db.tutorMessage.findMany({
      where: { learnerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { flags: { where: { learnerId: userId }, select: { id: true } } },
    });
    return rows.reverse().map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      germanPhrases: m.role === 'assistant' ? germanPhrases(m.content) : [],
      flagged: m.flags.length > 0,
      createdAt: m.createdAt,
    }));
  }

  /** FR-608: report a wrong or unsafe reply. Reporting twice is harmless. */
  async flag(userId: string, messageId: string, reason: string): Promise<void> {
    await this.limiter.hit(FLAG_LIMIT, userId);
    const message = await this.prisma.db.tutorMessage.findFirst({
      where: { id: messageId, learnerId: userId, role: 'assistant' },
      select: { id: true },
    });
    if (!message) throw new ApiError(404, 'message_not_found');
    await this.prisma.db.tutorFlag.upsert({
      where: { messageId_learnerId: { messageId, learnerId: userId } },
      create: { messageId, learnerId: userId, reason: reason.trim() },
      update: {},
    });
  }

  /** The reviewers' queue (FR-608). It shows the exchange and the level, never who wrote it. */
  async flagQueue(status: 'open' | 'resolved'): Promise<TutorFlagQueueItemDto[]> {
    const flags = await this.prisma.db.tutorFlag.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { message: true },
    });
    const items: TutorFlagQueueItemDto[] = [];
    for (const f of flags) {
      const question = await this.prisma.db.tutorMessage.findFirst({
        where: {
          learnerId: f.message.learnerId,
          role: 'user',
          createdAt: { lte: f.message.createdAt },
        },
        orderBy: { createdAt: 'desc' },
        select: { content: true },
      });
      items.push({
        id: f.id,
        status: f.status,
        reason: f.reason,
        level: f.message.level,
        question: question?.content ?? null,
        answer: f.message.content,
        note: f.note,
        createdAt: f.createdAt,
      });
    }
    return items;
  }

  async resolveFlag(staffId: string, flagId: string, note?: string): Promise<void> {
    const flag = await this.prisma.db.tutorFlag.findUnique({ where: { id: flagId } });
    if (!flag) throw new ApiError(404, 'flag_not_found');
    await this.prisma.db.tutorFlag.update({
      where: { id: flagId },
      data: { status: 'resolved', resolvedBy: staffId, resolvedAt: new Date(), note: note ?? null },
    });
  }

  /** NFR-15: deletes conversations older than 90 days. Safe to run often and from many instances. */
  async purge(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.db.tutorMessage.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }

  /** FR-607: counts a message against today's limit (IST day) or throws 429 with `resumesAt`. */
  private async takeDaily(userId: string): Promise<{ remaining: number; refund(): Promise<void> }> {
    const limit = await this.settings.get('tutor.dailyMessageLimit');
    const now = new Date();
    const key = `tutor:day:${userId}:${istDay(now)}`;
    const redis = await this.redis.connected();
    const used = await redis.incr(key);
    if (used === 1) await redis.expire(key, 36 * 60 * 60);
    if (used > limit) {
      await redis.decr(key);
      throw new ApiError(429, 'tutor_daily_limit', {
        resumesAt: nextIstMidnight(now).toISOString(),
      });
    }
    return {
      remaining: limit - used,
      refund: async () => {
        await redis.decr(key);
      },
    };
  }

  /** The questions the learner got wrong in their latest quizzes, as text (FR-604). */
  private async recentMistakes(userId: string, language: 'te' | 'en'): Promise<string[]> {
    const attempts = await this.prisma.db.quizAttempt.findMany({
      where: { learnerId: userId },
      orderBy: { finishedAt: 'desc' },
      take: 3,
      select: { answers: true },
    });
    const ids: string[] = [];
    for (const a of attempts) {
      for (const ans of a.answers as Array<{ questionId?: string; correct?: boolean }>) {
        if (ans.correct === false && ans.questionId && !ids.includes(ans.questionId))
          ids.push(ans.questionId);
      }
    }
    if (!ids.length) return [];
    const questions = await this.prisma.db.question.findMany({
      where: { id: { in: ids.slice(0, MAX_MISTAKES) } },
      select: { prompt: true },
    });
    return questions.map((q) => this.pick(q.prompt, language)).filter((t): t is string => !!t);
  }

  private pick(value: unknown, language: 'te' | 'en'): string | null {
    const v = value as Record<string, string> | null;
    return v?.[language] ?? v?.en ?? null;
  }
}
