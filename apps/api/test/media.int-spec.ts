import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/adapters/storage/object-storage.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { createStaff, resetState, staffLogin } from './helpers.js';

const dir = mkdtempSync(join(tmpdir(), 'media-fixtures-'));
const ffmpeg = (...args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
function fixture(name: string, make: (path: string) => void): Buffer {
  const path = join(dir, name);
  make(path);
  return readFileSync(path);
}

describe('media upload and compression (FR-1002, NFR-04)', () => {
  let app: INestApplication;
  let author: string;
  let reviewer: string;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const upload = (token: string, data: Buffer, name: string) =>
    http().post('/v1/studio/media').set(as(token)).attach('file', data, name);

  const speech = fixture('word.wav', (p) =>
    ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-ar', '44100', p),
  );
  const longSpeech = fixture('long.wav', (p) =>
    ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=440:duration=40', p),
  );
  const photo = fixture('photo.png', (p) =>
    ffmpeg('-f', 'lavfi', '-i', 'testsrc=size=1600x900', '-frames:v', '1', p),
  );

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    await createStaff(app, 'author', '+915599200001');
    await createStaff(app, 'reviewer', '+915599200002');
    const redis = await app.get(RedisService).connected();
    author = (await staffLogin(app, '+915599200001')).tokens.accessToken;
    await redis.del(...(await redis.keys('otp-cooldown:*')));
    reviewer = (await staffLogin(app, '+915599200002')).tokens.accessToken;
  });

  it('converts a WAV recording to Opus well under 100 KB and stores it', async () => {
    expect(speech.length).toBeGreaterThan(150_000);
    const res = await upload(author, speech, 'hallo.wav').expect(201);
    expect(res.body).toMatchObject({
      type: 'audio',
      mime: 'audio/ogg',
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(res.body.bytes).toBeLessThan(100 * 1024);
    expect(res.body.durationMs).toBeGreaterThan(1900);
    expect(res.body.durationMs).toBeLessThan(2200);
    const row = await app
      .get(PrismaService)
      .db.mediaAsset.findUniqueOrThrow({ where: { id: res.body.id } });
    await expect(app.get<ObjectStorage>(OBJECT_STORAGE).exists(row.storageKey)).resolves.toBe(true);
  });

  it('refuses recordings longer than 30 seconds', async () => {
    const res = await upload(author, longSpeech, 'long.wav');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'audio_too_long', maxSeconds: 30 });
  });

  it('converts pictures to WebP, at most 800 px wide', async () => {
    const res = await upload(author, photo, 'tools.png').expect(201);
    expect(res.body).toMatchObject({ type: 'image', mime: 'image/webp', width: 800, height: 450 });
    expect(res.body.bytes).toBeLessThan(200 * 1024);
  });

  it.each([
    [
      'an HLS playlist pointing at a URL',
      '#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://169.254.169.254/latest/meta-data\n#EXT-X-ENDLIST\n',
    ],
    ['an ffmpeg concat list pointing at a server file', 'ffconcat version 1.0\nfile /etc/passwd\n'],
    ['plain text', 'just some text, not media'],
  ])('rejects %s', async (_name, content) => {
    const res = await upload(author, Buffer.from(content), 'innocent.mp3');
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('unsupported_media');
  });

  it('rejects files over 15 MB', async () => {
    const res = await upload(author, Buffer.alloc(16 * 1024 * 1024, 1), 'huge.wav');
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('file_too_large');
  });

  it('lets reviewers preview but not upload', async () => {
    const created = (await upload(author, speech, 'hallo.wav').expect(201)).body;
    await upload(reviewer, speech, 'x.wav').expect(403);
    const meta = await http().get(`/v1/studio/media/${created.id}`).set(as(reviewer)).expect(200);
    expect(meta.body).not.toHaveProperty('storageKey');
    const content = await http()
      .get(`/v1/studio/media/${created.id}/content`)
      .set(as(reviewer))
      .buffer(true)
      .expect(200);
    expect(content.headers['content-type']).toBe('audio/ogg');
    expect(content.body.length).toBe(created.bytes);
  });
});
