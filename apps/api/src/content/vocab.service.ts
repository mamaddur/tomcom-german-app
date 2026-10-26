import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import type { VocabItem } from '../generated/prisma/client.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import type { VocabDto, VocabInputDto } from './dto/studio.dto.js';
import { isL10n } from './lesson-shape.js';

/** Shared vocabulary (FR-302, FR-305, FR-306). Changes go live with the next publish of a level. */
@Injectable()
export class VocabService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q?: string): Promise<VocabDto[]> {
    const rows = await this.prisma.db.vocabItem.findMany({
      where: q ? { german: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { german: 'asc' },
      take: 100,
    });
    return rows.map(toDto);
  }

  async get(id: string): Promise<VocabDto> {
    const row = await this.prisma.db.vocabItem.findUnique({ where: { id } });
    if (!row) throw new ApiError(404, 'vocab_not_found');
    return toDto(row);
  }

  /** FR-306: trade tags are trade codes, so the app can match them to the learner's trade. */
  private async assertTrades(tags: string[]) {
    const unique = [...new Set(tags)];
    if (unique.length === 0) return;
    const found = await this.prisma.db.trade.count({ where: { code: { in: unique } } });
    if (found !== unique.length) throw new ApiError(400, 'unknown_trade', { tradeTags: unique });
  }

  async create(dto: VocabInputDto, auth: AccessClaims): Promise<VocabDto> {
    if (!isL10n(dto.meaning)) throw new ApiError(400, 'invalid_l10n', { fields: ['meaning'] });
    await this.assertTrades(dto.tradeTags);
    return toDto(
      await this.prisma.db.vocabItem.create({
        data: { ...fields(dto), createdBy: auth.userId, updatedBy: auth.userId },
      }),
    );
  }

  async update(id: string, dto: VocabInputDto, auth: AccessClaims): Promise<VocabDto> {
    if (!isL10n(dto.meaning)) throw new ApiError(400, 'invalid_l10n', { fields: ['meaning'] });
    await this.assertTrades(dto.tradeTags);
    await this.get(id);
    return toDto(
      await this.prisma.db.vocabItem.update({
        where: { id },
        data: { ...fields(dto), updatedBy: auth.userId },
      }),
    );
  }
}

const fields = (dto: VocabInputDto) => ({
  german: dto.german.trim(),
  audioId: dto.audioId ?? null,
  article: dto.article ?? null,
  plural: dto.plural ?? null,
  meaning: dto.meaning,
  imageId: dto.imageId ?? null,
  tradeTags: [...new Set(dto.tradeTags)],
});

function toDto(v: VocabItem): VocabDto {
  return {
    id: v.id,
    german: v.german,
    audioId: v.audioId ?? undefined,
    article: v.article ?? undefined,
    plural: v.plural ?? undefined,
    meaning: v.meaning as Record<string, string>,
    imageId: v.imageId ?? undefined,
    tradeTags: v.tradeTags,
    updatedAt: v.updatedAt,
  };
}
