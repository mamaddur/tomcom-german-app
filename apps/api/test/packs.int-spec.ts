import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { validateLessonPack } from '@tomcom/content-schema';
import { strFromU8, unzipSync } from 'fflate';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { completeLesson } from './content-fixtures.js';
import { createStaff, registerLearner, resetState, staffLogin } from './helpers.js';

const wavPath = join(mkdtempSync(join(tmpdir(), 'pack-fixtures-')), 'word.wav');
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=330:duration=1',
  wavPath,
]);
const wav = readFileSync(wavPath);

describe('publishing lesson packs (FR-1004, ADR-008)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let author: string;
  let reviewer: string;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(phone: string) {
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
    return (await staffLogin(app, phone)).tokens.accessToken;
  }

  async function uploadAudio() {
    return (
      await http()
        .post('/v1/studio/media')
        .set(as(author))
        .attach('file', wav, 'word.wav')
        .expect(201)
    ).body.id as string;
  }

  /** Creates a lesson, fills it, and takes it through review to "approved". */
  async function approvedLesson(audioId: string, title = { te: 'పలకరింపులు', en: 'Greetings' }) {
    const lesson = (
      await http()
        .post('/v1/studio/lessons')
        .set(as(author))
        .send({ level: 'A1', title })
        .expect(201)
    ).body;
    const body = {
      ...completeLesson(1, { screen: randomUUID(), question: randomUUID(), audio: audioId }),
      title,
    };
    await http().put(`/v1/studio/lessons/${lesson.id}`).set(as(author)).send(body).expect(200);
    await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(author))
      .send({ to: 'in_review' })
      .expect(200);
    await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(reviewer))
      .send({ to: 'approved' })
      .expect(200);
    return lesson.id as string;
  }

  const publish = () => http().post('/v1/studio/levels/A1/publish').set(as(reviewer));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    await prisma.db.$executeRaw`TRUNCATE lessons, vocab_items, media_assets, pack_versions CASCADE`;
    await createStaff(app, 'author', '+915599300001');
    await createStaff(app, 'reviewer', '+915599300002');
    author = await login('+915599300001');
    reviewer = await login('+915599300002');
  });

  it('publishes approved lessons as a validated, offline-ready zip and marks them published', async () => {
    const audio = await uploadAudio();
    const lessonId = await approvedLesson(audio);
    const draft = (
      await http()
        .post('/v1/studio/lessons')
        .set(as(author))
        .send({ level: 'A1', title: { en: 'WIP' } })
        .expect(201)
    ).body;

    const res = await publish().expect(200);
    expect(res.body.pack).toMatchObject({ level: 'A1', version: 1, lessonCount: 1 });
    expect(res.body.skippedLessonIds).toEqual([draft.id]);

    const lesson = await prisma.db.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(lesson).toMatchObject({ status: 'published', publishedRevision: 2 });

    // What a learner's phone downloads.
    const learner = (await registerLearner(app, '+915500000951')).tokens.accessToken;
    expect((await http().get('/v1/packs').set(as(learner)).expect(200)).body).toEqual([
      expect.objectContaining({ level: 'A1', version: 1 }),
    ]);
    const dl = await http()
      .get('/v1/packs/A1/1/download')
      .set(as(learner))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(dl.headers['content-type']).toBe('application/zip');
    const zip = dl.body as Buffer;
    expect(createHash('sha256').update(zip).digest('hex')).toBe(res.body.pack.sha256);

    const files = unzipSync(new Uint8Array(zip));
    const manifest = JSON.parse(strFromU8(files['manifest.json']!));
    expect(validateLessonPack(manifest)).toEqual({ valid: true, errors: [] });
    expect(manifest.lessons.map((l: { id: string }) => l.id)).toEqual([lessonId]);
    expect(Object.keys(files)).toContain(`audio/${audio}.opus`);
  });

  it('refuses to publish when a German phrase has no recording (FR-302)', async () => {
    await approvedLesson(randomUUID()); // points at audio that was never uploaded
    const res = await publish();
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('pack_invalid');
    expect(res.body.errors.join()).toMatch(/missing audio media/);
    expect(await prisma.db.packVersion.count()).toBe(0);
  });

  it('keeps the published version live while a lesson is being edited again', async () => {
    const audio = await uploadAudio();
    const lessonId = await approvedLesson(audio);
    await publish().expect(200);

    const edited = { ...completeLesson(2), title: { te: 'కొత్త శీర్షిక', en: 'Work in progress' } };
    await http().put(`/v1/studio/lessons/${lessonId}`).set(as(author)).send(edited).expect(200);

    const second = (await publish().expect(200)).body.pack;
    expect(second.version).toBe(2);
    const manifest = JSON.parse(
      (await http().get('/v1/packs/A1/2/manifest').set(as(reviewer)).expect(200)).text,
    );
    expect(manifest.lessons[0].title.en).toBe('Greetings');
    expect((await prisma.db.lesson.findUniqueOrThrow({ where: { id: lessonId } })).status).toBe(
      'draft',
    );
  });

  it('only reviewers publish; there must be something to publish', async () => {
    await http().post('/v1/studio/levels/A1/publish').set(as(author)).expect(403);
    const empty = await publish();
    expect(empty.status).toBe(409);
    expect(empty.body.code).toBe('nothing_to_publish');
  });
});

function binary(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
