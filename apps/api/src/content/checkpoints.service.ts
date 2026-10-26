import { Injectable } from '@nestjs/common';
import { type CheckpointShape, validateCheckpoint } from '@tomcom/content-schema';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import type { LevelCode, Prisma } from '../generated/prisma/client.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';

export const LEVELS: LevelCode[] = ['A1', 'A2', 'B1'];

/** A new checkpoint starts empty with sensible draw sizes; authors fill the banks. */
const EMPTY: CheckpointShape = {
  passMark: 0.6,
  draw: { reading: 10, listening: 10, writing: 1 },
  sections: { reading: [], listening: [], writing: [] },
};

export interface CheckpointView {
  level: LevelCode;
  content: CheckpointShape;
  revision: number;
  updatedAt: Date | null;
  publishedRevision: number | null;
  publishedAt: Date | null;
  /** Problems that block publishing (empty when it can be published). */
  problems: string[];
}

/**
 * FR-404 authoring. Authors edit one draft per level; a reviewer who did not make the last edit
 * publishes it (four eyes, FR-1003). Learners always take the published copy.
 */
@Injectable()
export class CheckpointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async levelId(level: LevelCode) {
    return (await this.prisma.db.level.findUniqueOrThrow({ where: { code: level } })).id;
  }

  async list(): Promise<CheckpointView[]> {
    return Promise.all(LEVELS.map((l) => this.get(l)));
  }

  async get(level: LevelCode): Promise<CheckpointView> {
    const row = await this.prisma.db.checkpoint.findFirst({ where: { level: { code: level } } });
    const content = (row?.content as unknown as CheckpointShape) ?? EMPTY;
    return {
      level,
      content,
      revision: row?.revision ?? 0,
      updatedAt: row?.updatedAt ?? null,
      publishedRevision: row?.publishedRevision ?? null,
      publishedAt: row?.publishedAt ?? null,
      problems: validateCheckpoint(content, { forPublish: true }).errors,
    };
  }

  async save(
    level: LevelCode,
    expectedRevision: number,
    content: CheckpointShape,
    auth: AccessClaims,
  ): Promise<CheckpointView> {
    const levelId = await this.levelId(level);
    await this.prisma.db.$transaction(async (tx) => {
      // Lock the row (or the level, before the first save) against concurrent editors.
      await tx.$executeRaw`SELECT 1 FROM levels WHERE id = ${levelId}::uuid FOR UPDATE`;
      const row = await tx.checkpoint.findUnique({ where: { levelId } });
      const current = row?.revision ?? 0;
      if (current !== expectedRevision) {
        throw new ApiError(409, 'revision_conflict', { currentRevision: current });
      }
      const data = { content: content as unknown as Prisma.InputJsonValue, updatedBy: auth.userId };
      if (row)
        await tx.checkpoint.update({
          where: { levelId },
          data: { ...data, revision: current + 1 },
        });
      else await tx.checkpoint.create({ data: { ...data, levelId, revision: 1 } });
    });
    return this.get(level);
  }

  async publish(level: LevelCode, auth: AccessClaims, ip?: string): Promise<CheckpointView> {
    const levelId = await this.levelId(level);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM levels WHERE id = ${levelId}::uuid FOR UPDATE`;
      const row = await tx.checkpoint.findUnique({ where: { levelId } });
      if (!row) throw new ApiError(404, 'checkpoint_not_found');
      if (row.updatedBy === auth.userId) throw new ApiError(403, 'four_eyes');
      const content = row.content as unknown as CheckpointShape;
      const check = validateCheckpoint(content, { forPublish: true });
      const audio = [...content.sections.reading, ...content.sections.listening]
        .map((q) => q.payload.audio)
        .filter((a): a is string => !!a);
      const found = await tx.mediaAsset.count({ where: { id: { in: audio }, type: 'audio' } });
      if (found !== new Set(audio).size)
        check.errors.push('a question uses a recording that does not exist');
      if (check.errors.length) {
        throw new ApiError(422, 'checkpoint_incomplete', { errors: check.errors });
      }
      await tx.checkpoint.update({
        where: { levelId },
        data: {
          publishedContent: row.content as Prisma.InputJsonValue,
          publishedRevision: row.revision,
          publishedBy: auth.userId,
          publishedAt: new Date(),
        },
      });
    });
    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'checkpoint_publish',
      entityType: 'checkpoint',
      entityId: level,
      outcome: 'success',
      ip,
    });
    return this.get(level);
  }
}
