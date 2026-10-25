import { Injectable } from '@nestjs/common';
import { validateLesson } from '@tomcom/content-schema';
import { ApiError } from '../common/api-error.js';
import { Prisma, type ContentStatus, type LevelCode } from '../generated/prisma/client.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import type {
  LessonDetailDto,
  LessonSummaryDto,
  TransitionDto,
  UpdateLessonDto,
} from './dto/studio.dto.js';
import { isL10n, toPackLesson, type LessonWithParts } from './lesson-shape.js';

const WITH_PARTS = { screens: { orderBy: { order: 'asc' } }, questions: true } as const;

/**
 * Content studio rules (FR-1001, FR-1003, FR-1005).
 *
 *   draft ──submit──▶ in_review ──approve──▶ approved ──publish (3b)──▶ published
 *     ▲                  │ withdraw / send back (comment)                 │
 *     └──────────────────┴────── editing an approved/published lesson ◀───┘
 *
 * - Every save is a new revision with a full snapshot; rollback restores one as a new draft.
 * - A lesson in review is locked. A reviewer cannot approve a revision they edited (four eyes).
 * - Submitting needs every text in Telugu and English and a well-formed lesson (content-schema).
 */
@Injectable()
export class StudioService {
  constructor(private readonly prisma: PrismaService) {}

  async levels() {
    const levels = await this.prisma.db.level.findMany({
      orderBy: { order: 'asc' },
      include: { _count: { select: { lessons: true } } },
    });
    return levels.map((l) => ({
      id: l.id,
      code: l.code,
      title: l.title as Record<string, string>,
      lessonCount: l._count.lessons,
    }));
  }

  async list(level?: LevelCode, status?: ContentStatus): Promise<LessonSummaryDto[]> {
    const lessons = await this.prisma.db.lesson.findMany({
      where: { ...(level ? { level: { code: level } } : {}), ...(status ? { status } : {}) },
      include: { level: { select: { code: true } } },
      orderBy: [{ level: { order: 'asc' } }, { order: 'asc' }],
    });
    return lessons.map((l) => this.summary(l, l.level.code));
  }

  async create(
    level: LevelCode,
    title: Record<string, string>,
    auth: AccessClaims,
  ): Promise<LessonDetailDto> {
    if (!isL10n(title)) throw new ApiError(400, 'invalid_l10n', { field: 'title' });
    const lvl = await this.prisma.db.level.findUniqueOrThrow({ where: { code: level } });
    const lesson = await this.prisma.db.$transaction(async (tx) => {
      const last = await tx.lesson.aggregate({ where: { levelId: lvl.id }, _max: { order: true } });
      const created = await tx.lesson.create({
        data: {
          levelId: lvl.id,
          order: (last._max.order ?? 0) + 1,
          title,
          description: {},
          estMinutes: 15,
          tradeTags: [],
          createdBy: auth.userId,
          updatedBy: auth.userId,
        },
        include: WITH_PARTS,
      });
      await this.snapshot(tx, created, auth.userId);
      return created;
    });
    return this.get(lesson.id);
  }

  async get(id: string): Promise<LessonDetailDto> {
    const lesson = await this.prisma.db.lesson.findUnique({
      where: { id },
      include: {
        ...WITH_PARTS,
        level: { select: { code: true } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!lesson) throw new ApiError(404, 'lesson_not_found');
    return {
      ...this.summary(lesson, lesson.level.code),
      description: lesson.description as Record<string, string>,
      estMinutes: lesson.estMinutes,
      tradeTags: lesson.tradeTags,
      updatedBy: lesson.updatedBy,
      screens: lesson.screens.map((s) => ({
        id: s.id,
        order: s.order,
        type: s.type,
        body: s.body as Record<string, unknown>,
      })),
      questions: lesson.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt as Record<string, string>,
        payload: q.payload as Record<string, unknown>,
        answer: q.answer,
        explanation: q.explanation as Record<string, string>,
        difficulty: q.difficulty,
      })),
      comments: lesson.comments.map((c) => ({
        id: c.id,
        revision: c.revision,
        authorId: c.authorId,
        body: c.body,
        createdAt: c.createdAt,
      })),
    };
  }

  /** Replaces the lesson's content. Editing approved or published content reopens it as a draft. */
  async update(id: string, dto: UpdateLessonDto, auth: AccessClaims): Promise<LessonDetailDto> {
    this.assertTexts(dto);
    this.assertUniqueIds(dto);
    await this.prisma.db.$transaction(async (tx) => {
      const current = await this.load(tx, id);
      if (current.status === 'in_review') throw new ApiError(409, 'lesson_in_review');
      if (current.revision !== dto.expectedRevision) {
        throw new ApiError(409, 'revision_conflict', { currentRevision: current.revision });
      }
      await this.replaceContent(tx, current, dto, auth.userId);
    });
    return this.get(id);
  }

  async transition(id: string, dto: TransitionDto, auth: AccessClaims): Promise<LessonDetailDto> {
    await this.prisma.db.$transaction(async (tx) => {
      const lesson = await this.load(tx, id);
      const from = lesson.status;
      const isReviewer = auth.role === 'reviewer';

      if (dto.to === 'in_review') {
        if (from !== 'draft') throw invalidTransition(from, dto.to);
        if (auth.role !== 'author') throw new ApiError(403, 'forbidden');
        const check = validateLesson(toPackLesson(lesson));
        if (!check.valid) throw new ApiError(422, 'lesson_incomplete', { errors: check.errors });
      } else if (dto.to === 'approved') {
        if (from !== 'in_review') throw invalidTransition(from, dto.to);
        if (!isReviewer) throw new ApiError(403, 'forbidden');
        if (lesson.updatedBy === auth.userId) throw new ApiError(403, 'four_eyes');
      } else {
        // Back to draft: author withdraws, or reviewer sends back / unapproves with a reason.
        if (from !== 'in_review' && from !== 'approved') throw invalidTransition(from, dto.to);
        if (from === 'approved' && !isReviewer) throw new ApiError(403, 'forbidden');
        if (isReviewer && !dto.comment) throw new ApiError(400, 'comment_required');
      }

      await tx.lesson.update({ where: { id }, data: { status: dto.to } });
      await tx.lessonRevision.update({
        where: { lessonId_revision: { lessonId: id, revision: lesson.revision } },
        data: { status: dto.to },
      });
      if (dto.comment) {
        await tx.reviewComment.create({
          data: {
            lessonId: id,
            revision: lesson.revision,
            authorId: auth.userId,
            body: dto.comment,
          },
        });
      }
    });
    return this.get(id);
  }

  async comment(id: string, body: string, auth: AccessClaims): Promise<LessonDetailDto> {
    const lesson = await this.prisma.db.lesson.findUnique({
      where: { id },
      select: { revision: true },
    });
    if (!lesson) throw new ApiError(404, 'lesson_not_found');
    await this.prisma.db.reviewComment.create({
      data: { lessonId: id, revision: lesson.revision, authorId: auth.userId, body },
    });
    return this.get(id);
  }

  async revisions(id: string) {
    const rows = await this.prisma.db.lessonRevision.findMany({
      where: { lessonId: id },
      orderBy: { revision: 'desc' },
      select: { revision: true, status: true, createdBy: true, createdAt: true },
    });
    if (!rows.length) throw new ApiError(404, 'lesson_not_found');
    return rows;
  }

  /** FR-1005: restore an earlier revision's content as a new draft revision. */
  async rollback(id: string, revision: number, auth: AccessClaims): Promise<LessonDetailDto> {
    await this.prisma.db.$transaction(async (tx) => {
      const current = await this.load(tx, id);
      if (current.status === 'in_review') throw new ApiError(409, 'lesson_in_review');
      const old = await tx.lessonRevision.findUnique({
        where: { lessonId_revision: { lessonId: id, revision } },
      });
      if (!old) throw new ApiError(404, 'revision_not_found');
      const s = old.snapshot as unknown as Snapshot;
      await this.replaceContent(
        tx,
        current,
        {
          expectedRevision: current.revision,
          title: s.title,
          description: s.description,
          estMinutes: s.estMinutes,
          tradeTags: s.tradeTags,
          screens: s.screens,
          questions: s.questions,
        },
        auth.userId,
      );
    });
    return this.get(id);
  }

  async reorder(level: LevelCode, lessonIds: string[]): Promise<LessonSummaryDto[]> {
    const lvl = await this.prisma.db.level.findUniqueOrThrow({
      where: { code: level },
      include: { lessons: { select: { id: true } } },
    });
    const existing = new Set(lvl.lessons.map((l) => l.id));
    if (lessonIds.length !== existing.size || !lessonIds.every((id) => existing.has(id))) {
      throw new ApiError(400, 'lesson_order_mismatch');
    }
    await this.prisma.db.$transaction(
      lessonIds.map((id, i) =>
        this.prisma.db.lesson.update({ where: { id }, data: { order: i + 1 } }),
      ),
    );
    return this.list(level);
  }

  // ── internals ──

  private async load(tx: Prisma.TransactionClient, id: string): Promise<LessonWithParts> {
    // Row lock so concurrent saves or transitions on one lesson are serialised.
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM lessons WHERE id = ${id}::uuid FOR UPDATE`;
    if (!locked.length) throw new ApiError(404, 'lesson_not_found');
    return tx.lesson.findUniqueOrThrow({ where: { id }, include: WITH_PARTS });
  }

  private async replaceContent(
    tx: Prisma.TransactionClient,
    current: LessonWithParts,
    dto: UpdateLessonDto,
    userId: string,
  ) {
    await this.assertIdsNotTaken(tx, current.id, dto);
    await tx.screen.deleteMany({ where: { lessonId: current.id } });
    await tx.question.deleteMany({ where: { lessonId: current.id } });
    const updated = await tx.lesson.update({
      where: { id: current.id },
      data: {
        title: dto.title,
        description: dto.description,
        estMinutes: dto.estMinutes,
        tradeTags: dto.tradeTags,
        status: 'draft',
        revision: { increment: 1 },
        updatedBy: userId,
        screens: {
          create: dto.screens.map((s, i) => ({
            id: s.id,
            order: i + 1,
            type: s.type,
            body: s.body as Prisma.InputJsonValue,
          })),
        },
        questions: {
          create: dto.questions.map((q) => ({
            id: q.id,
            type: q.type,
            prompt: q.prompt,
            payload: q.payload as Prisma.InputJsonValue,
            answer: (q.answer ?? null) as Prisma.InputJsonValue,
            explanation: q.explanation,
            difficulty: q.difficulty,
          })),
        },
      },
      include: WITH_PARTS,
    });
    await this.snapshot(tx, updated, userId);
  }

  private async snapshot(tx: Prisma.TransactionClient, lesson: LessonWithParts, userId: string) {
    const snapshot: Snapshot = {
      title: lesson.title as Record<string, string>,
      description: lesson.description as Record<string, string>,
      estMinutes: lesson.estMinutes,
      tradeTags: lesson.tradeTags,
      screens: lesson.screens.map((s) => ({
        id: s.id,
        type: s.type,
        body: s.body as Record<string, unknown>,
      })),
      questions: lesson.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt as Record<string, string>,
        payload: q.payload as Record<string, unknown>,
        answer: q.answer,
        explanation: q.explanation as Record<string, string>,
        difficulty: q.difficulty,
      })),
    };
    await tx.lessonRevision.create({
      data: {
        lessonId: lesson.id,
        revision: lesson.revision,
        status: lesson.status,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        createdBy: userId,
      },
    });
  }

  private assertTexts(dto: UpdateLessonDto) {
    const fields: Array<[string, unknown]> = [
      ['title', dto.title],
      ['description', dto.description],
      ...dto.questions.flatMap((q, i): Array<[string, unknown]> => [
        [`questions[${i}].prompt`, q.prompt],
        [`questions[${i}].explanation`, q.explanation],
      ]),
    ];
    const bad = fields.filter(([, v]) => !isL10n(v)).map(([f]) => f);
    if (bad.length) throw new ApiError(400, 'invalid_l10n', { fields: bad });
  }

  private assertUniqueIds(dto: UpdateLessonDto) {
    const ids = [...dto.screens.map((s) => s.id), ...dto.questions.map((q) => q.id)];
    if (new Set(ids).size !== ids.length) throw new ApiError(400, 'duplicate_ids');
  }

  /** Ids are global and permanent: another lesson's screen or question id cannot be reused. */
  private async assertIdsNotTaken(
    tx: Prisma.TransactionClient,
    lessonId: string,
    dto: UpdateLessonDto,
  ) {
    const [screens, questions] = await Promise.all([
      tx.screen.count({
        where: { id: { in: dto.screens.map((s) => s.id) }, lessonId: { not: lessonId } },
      }),
      tx.question.count({
        where: { id: { in: dto.questions.map((q) => q.id) }, lessonId: { not: lessonId } },
      }),
    ]);
    if (screens || questions) throw new ApiError(409, 'id_in_use_elsewhere');
  }

  private summary(
    l: {
      id: string;
      order: number;
      title: unknown;
      status: ContentStatus;
      revision: number;
      publishedRevision: number | null;
      updatedAt: Date;
    },
    level: string,
  ): LessonSummaryDto {
    return {
      id: l.id,
      level,
      order: l.order,
      title: l.title as Record<string, string>,
      status: l.status,
      revision: l.revision,
      publishedRevision: l.publishedRevision,
      updatedAt: l.updatedAt,
    };
  }
}

type Snapshot = Omit<UpdateLessonDto, 'expectedRevision'>;

const invalidTransition = (from: string, to: string) =>
  new ApiError(409, 'invalid_transition', { from, to });
