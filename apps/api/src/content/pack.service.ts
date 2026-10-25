import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { validateLessonPack } from '@tomcom/content-schema';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { OBJECT_STORAGE, type ObjectStorage } from '../adapters/storage/object-storage.js';
import { ApiError } from '../common/api-error.js';
import type { LevelCode, MediaAsset, PackVersion, Prisma } from '../generated/prisma/client.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { toPackLesson } from './lesson-shape.js';

type PackLesson = ReturnType<typeof toPackLesson>;
interface Snapshot {
  title: unknown;
  description: unknown;
  estMinutes: number;
  tradeTags: string[];
  screens: Array<{ id: string; type: string; body: Record<string, unknown> }>;
  questions: Array<Record<string, unknown>>;
}

/**
 * Publishing a level (FR-1004, ADR-008): builds an immutable, versioned lesson pack — manifest +
 * media in one zip for offline use — validates it with @tomcom/content-schema, stores it, and
 * marks the included lessons published. Learners get it without an app release.
 */
@Injectable()
export class PackService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly settings: SettingsService,
  ) {}

  async publish(level: LevelCode, auth: AccessClaims) {
    return this.prisma.db.$transaction(
      async (tx) => {
        // One publish per level at a time.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'publish:' + level}))`;
        const lvl = await tx.level.findUniqueOrThrow({ where: { code: level } });
        const lessons = await tx.lesson.findMany({
          where: { levelId: lvl.id },
          include: { screens: { orderBy: { order: 'asc' } }, questions: true, revisions: true },
          orderBy: { order: 'asc' },
        });

        const included: Array<{
          lesson: PackLesson;
          publishNow: { id: string; revision: number } | null;
        }> = [];
        const skipped: string[] = [];
        for (const l of lessons) {
          if (l.status === 'approved') {
            included.push({
              lesson: toPackLesson(l),
              publishNow: { id: l.id, revision: l.revision },
            });
          } else if (l.status === 'published') {
            included.push({ lesson: toPackLesson(l), publishNow: null });
          } else if (l.publishedRevision !== null) {
            // Edited since it was published: learners keep the published revision.
            const rev = l.revisions.find((r) => r.revision === l.publishedRevision);
            if (!rev) throw new ApiError(500, 'published_revision_missing');
            included.push({
              lesson: fromSnapshot(l.id, l.order, rev.snapshot as unknown as Snapshot),
              publishNow: null,
            });
          } else {
            skipped.push(l.id);
          }
        }
        if (!included.length) throw new ApiError(409, 'nothing_to_publish');

        const packLessons = included.map((i) => i.lesson);
        const vocab = await this.vocabFor(tx, packLessons);
        const media = await this.mediaFor(tx, packLessons, vocab);
        const last = await tx.packVersion.aggregate({
          where: { levelId: lvl.id },
          _max: { version: true },
        });
        const version = (last._max.version ?? 0) + 1;

        const manifest = {
          schemaVersion: 1,
          level,
          version,
          publishedAt: new Date().toISOString(),
          // FR-1101: the quiz settings in force when the pack is published.
          settings: {
            passMark: await this.settings.get('quiz.passMark'),
            questionsPerQuiz: await this.settings.get('quiz.questionsPerQuiz'),
          },
          lessons: packLessons,
          vocab: vocab.items,
          media: media.map(mediaRef),
        };
        const check = validateLessonPack(manifest);
        if (!check.valid) throw new ApiError(422, 'pack_invalid', { errors: check.errors });

        // Media is already compressed (Opus/WebP), so it is stored, not deflated again.
        const files: Zippable = {
          'manifest.json': [strToU8(JSON.stringify(manifest)), { level: 9 }],
        };
        for (const m of media)
          files[mediaRef(m).path] = [await this.storage.get(m.storageKey), { level: 0 }];
        const zip = Buffer.from(zipSync(files));
        const prefix = `packs/${level}/v${version}`;
        await this.storage.put(
          `${prefix}/manifest.json`,
          Buffer.from(JSON.stringify(manifest)),
          'application/json',
        );
        await this.storage.put(`${prefix}.zip`, zip, 'application/zip');

        const pack = await tx.packVersion.create({
          data: {
            levelId: lvl.id,
            version,
            zipKey: `${prefix}.zip`,
            manifestKey: `${prefix}/manifest.json`,
            bytes: zip.length,
            sha256: createHash('sha256').update(zip).digest('hex'),
            lessonCount: packLessons.length,
            publishedBy: auth.userId,
          },
        });
        for (const { publishNow } of included) {
          if (!publishNow) continue;
          await tx.lesson.update({
            where: { id: publishNow.id },
            data: { status: 'published', publishedRevision: publishNow.revision },
          });
          await tx.lessonRevision.update({
            where: {
              lessonId_revision: { lessonId: publishNow.id, revision: publishNow.revision },
            },
            data: { status: 'published' },
          });
        }
        return { pack: toPackDto(pack, level), skippedLessonIds: skipped };
      },
      { timeout: 120_000 },
    );
  }

  async history(level: LevelCode) {
    const packs = await this.prisma.db.packVersion.findMany({
      where: { level: { code: level } },
      orderBy: { version: 'desc' },
    });
    return packs.map((p) => toPackDto(p, level));
  }

  /** The newest pack of each level (what the app offers to download). */
  async latest() {
    const levels = await this.prisma.db.level.findMany({
      orderBy: { order: 'asc' },
      include: { packs: { orderBy: { version: 'desc' }, take: 1 } },
    });
    return levels.filter((l) => l.packs[0]).map((l) => toPackDto(l.packs[0]!, l.code));
  }

  async file(level: LevelCode, version: number, kind: 'zip' | 'manifest') {
    const pack = await this.prisma.db.packVersion.findFirst({
      where: { level: { code: level }, version },
    });
    if (!pack) throw new ApiError(404, 'pack_not_found');
    return { pack, body: await this.storage.get(kind === 'zip' ? pack.zipKey : pack.manifestKey) };
  }

  private async vocabFor(tx: Prisma.TransactionClient, lessons: PackLesson[]) {
    const ids = new Set<string>();
    for (const l of lessons)
      for (const s of l.screens)
        for (const id of (s as { vocabIds?: string[] }).vocabIds ?? []) ids.add(id);
    const rows = await tx.vocabItem.findMany({ where: { id: { in: [...ids] } } });
    return {
      items: rows.map((v) => ({
        id: v.id,
        // A vocabulary item without a recording fails validation (FR-302): every German word has audio.
        german: { text: v.german, audio: v.audioId ?? '' },
        ...(v.article ? { article: v.article } : {}),
        ...(v.plural ? { plural: v.plural } : {}),
        meaning: v.meaning,
        ...(v.imageId ? { image: v.imageId } : {}),
        ...(v.tradeTags.length ? { tradeTags: v.tradeTags } : {}),
      })),
    };
  }

  private async mediaFor(
    tx: Prisma.TransactionClient,
    lessons: PackLesson[],
    vocab: { items: Array<Record<string, unknown>> },
  ) {
    const ids = new Set<string>();
    collectMediaIds([lessons, vocab.items], ids);
    return tx.mediaAsset.findMany({ where: { id: { in: [...ids].filter(isUuid) } } });
  }
}

function fromSnapshot(id: string, order: number, s: Snapshot): PackLesson {
  return {
    id,
    order,
    title: s.title,
    description: s.description,
    estMinutes: s.estMinutes,
    ...(s.tradeTags.length ? { tradeTags: s.tradeTags } : {}),
    screens: s.screens.map((sc, i) => ({ id: sc.id, order: i + 1, type: sc.type, ...sc.body })),
    questions: s.questions as PackLesson['questions'],
  } as PackLesson;
}

/** Every `{text, audio}` pair, vocabulary image and lesson video referenced anywhere in the pack. */
function collectMediaIds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) node.forEach((n) => collectMediaIds(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.text === 'string' && typeof o.audio === 'string') out.add(o.audio);
    if (typeof o.image === 'string') out.add(o.image);
    if (typeof o.video === 'string') out.add(o.video);
    Object.values(o).forEach((v) => collectMediaIds(v, out));
  }
}

const isUuid = (v: string) => /^[0-9a-f-]{36}$/.test(v);

function mediaRef(m: MediaAsset) {
  const folder = m.type === 'audio' ? 'audio' : m.type === 'image' ? 'images' : 'video';
  const ext = m.storageKey.split('.').pop();
  return {
    id: m.id,
    type: m.type,
    path: `${folder}/${m.id}.${ext}`,
    bytes: m.bytes,
    sha256: m.sha256,
    ...(m.durationMs ? { durationMs: m.durationMs } : {}),
  };
}

function toPackDto(p: PackVersion, level: string) {
  return {
    level,
    version: p.version,
    bytes: p.bytes,
    sha256: p.sha256,
    lessonCount: p.lessonCount,
    publishedAt: p.publishedAt,
  };
}
