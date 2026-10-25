import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from '../adapters/storage/object-storage.js';
import { ApiError } from '../common/api-error.js';
import type { MediaAsset } from '../generated/prisma/client.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { probe, toOpus, toWebp } from './ffmpeg.js';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Words and sentences, one per clip; dialogues are split per line. */
export const MAX_AUDIO_MS = 30_000;
/** NFR-04 */
export const MAX_AUDIO_BYTES = 100 * 1024;
export const MAX_IMAGE_BYTES = 200 * 1024;
const MAX_IMAGE_SIDE = 8000;

// Allowlist of container formats detected by ffprobe (never the file name or client MIME type).
const AUDIO_FORMATS = new Set([
  'mp3',
  'wav',
  'ogg',
  'flac',
  'aac',
  'mov,mp4,m4a,3gp,3g2,mj2',
  'matroska,webm',
]);
const IMAGE_FORMATS = new Set(['png_pipe', 'jpeg_pipe', 'webp_pipe']);

/** FR-1002: uploads are converted for phones on weak networks before they are stored. */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async upload(data: Buffer, auth: AccessClaims): Promise<MediaAsset> {
    if (data.length === 0) throw new ApiError(400, 'empty_file');
    const dir = await mkdtemp(join(tmpdir(), 'tomcom-media-'));
    try {
      const input = join(dir, 'input');
      await writeFile(input, data);
      const info = await probe(input);
      if (!info) throw new ApiError(415, 'unsupported_media');

      const id = randomUUID();
      if (IMAGE_FORMATS.has(info.formatName)) {
        if ((info.width ?? 0) > MAX_IMAGE_SIDE || (info.height ?? 0) > MAX_IMAGE_SIDE)
          throw new ApiError(422, 'image_too_large');
        const out = join(dir, 'out.webp');
        await toWebp(input, out);
        const bytes = await readFile(out);
        if (bytes.length > MAX_IMAGE_BYTES) throw new ApiError(422, 'image_too_large');
        const converted = await probe(out);
        return this.store(id, 'image', 'image/webp', 'webp', bytes, auth, {
          width: converted?.width ?? null,
          height: converted?.height ?? null,
        });
      }
      if (AUDIO_FORMATS.has(info.formatName) && info.hasAudio) {
        if (info.durationMs === null || info.durationMs > MAX_AUDIO_MS) {
          throw new ApiError(422, 'audio_too_long', { maxSeconds: MAX_AUDIO_MS / 1000 });
        }
        const out = join(dir, 'out.opus');
        await toOpus(input, out);
        const bytes = await readFile(out);
        if (bytes.length > MAX_AUDIO_BYTES) throw new ApiError(422, 'audio_too_large');
        const converted = await probe(out);
        return this.store(id, 'audio', 'audio/ogg', 'opus', bytes, auth, {
          durationMs: converted?.durationMs ?? info.durationMs,
        });
      }
      throw new ApiError(415, 'unsupported_media');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async get(id: string): Promise<MediaAsset> {
    const asset = await this.prisma.db.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new ApiError(404, 'media_not_found');
    return asset;
  }

  async content(id: string): Promise<{ asset: MediaAsset; body: Buffer }> {
    const asset = await this.get(id);
    return { asset, body: await this.storage.get(asset.storageKey) };
  }

  private async store(
    id: string,
    type: 'audio' | 'image',
    mime: string,
    ext: string,
    bytes: Buffer,
    auth: AccessClaims,
    extra: { durationMs?: number | null; width?: number | null; height?: number | null },
  ): Promise<MediaAsset> {
    const storageKey = `media/${id}.${ext}`;
    await this.storage.put(storageKey, bytes, mime);
    return this.prisma.db.mediaAsset.create({
      data: {
        id,
        type,
        storageKey,
        mime,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        durationMs: extra.durationMs ?? null,
        width: extra.width ?? null,
        height: extra.height ?? null,
        createdBy: auth.userId,
      },
    });
  }
}
