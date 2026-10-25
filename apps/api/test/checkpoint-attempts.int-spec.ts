import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/adapters/storage/object-storage.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { completeCheckpoint } from './checkpoint-fixtures.js';
import { createStaff, registerLearner, resetState, staffLogin } from './helpers.js';

type Item = { id: string; type: string; payload: { options?: string[]; audio?: string } };

/** FR-404 attempts, writing marked by a trainer, FR-907 readiness. Synthetic data only. */
describe('checkpoint attempts', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let learner: { tokens: { accessToken: string }; user: { id: string } };
  let trainer: string;
  let otherTrainer: string;
  let admin: string;
  let lessonId: string;
  let content: ReturnType<typeof completeCheckpoint>;
  let audioId: string;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const me = () => as(learner.tokens.accessToken);

  async function login(phone: string) {
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
    return (await staffLogin(app, phone)).tokens.accessToken;
  }

  const answerKey = (id: string) =>
    [...content.sections.reading, ...content.sections.listening].find((q) => q.id === id)!.answer;
  /** Answers every drawn question, right or wrong. */
  const answersFor = (
    sections: { reading: Item[]; listening: Item[] },
    right: (i: number) => boolean,
  ) =>
    Object.fromEntries(
      [...sections.reading, ...sections.listening].map((q, i) => {
        const key = answerKey(q.id) as number;
        return [q.id, right(i) ? key : (key + 1) % q.payload.options!.length];
      }),
    );
  const essay = 'Ich heiße Ravi. Ich bin Elektriker. Ich arbeite gern in Deutschland. Viele Grüße';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    await prisma.db.$executeRaw`TRUNCATE lessons, checkpoints, media_assets CASCADE`;
    const author = await createStaff(app, 'author', '+915599920001');
    const tr = await createStaff(app, 'trainer', '+915599920002');
    await createStaff(app, 'trainer', '+915599920003');
    await createStaff(app, 'tomcom_admin', '+915599920004');
    trainer = await login('+915599920002');
    otherTrainer = await login('+915599920003');
    admin = await login('+915599920004');
    const a1 = await prisma.db.level.findUniqueOrThrow({ where: { code: 'A1' } });
    lessonId = (
      await prisma.db.lesson.create({
        data: {
          levelId: a1.id,
          order: 1,
          title: { te: 'పాఠం', en: 'Lesson' },
          description: {},
          estMinutes: 10,
          status: 'published',
          publishedRevision: 1,
          createdBy: author.id,
          updatedBy: author.id,
        },
      })
    ).id;
    const key = `test/${randomUUID()}.opus`;
    await app
      .get<ObjectStorage>(OBJECT_STORAGE)
      .put(key, Buffer.from('OggS synthetic'), 'audio/ogg');
    audioId = (
      await prisma.db.mediaAsset.create({
        data: {
          type: 'audio',
          storageKey: key,
          mime: 'audio/ogg',
          bytes: 14,
          sha256: 'a'.repeat(64),
          createdBy: author.id,
        },
      })
    ).id;
    content = completeCheckpoint(audioId, 4);
    await prisma.db.checkpoint.create({
      data: {
        levelId: a1.id,
        content,
        updatedBy: author.id,
        publishedContent: content,
        publishedRevision: 1,
        publishedBy: author.id,
        publishedAt: new Date(),
      },
    });
    await prisma.db.batch.create({
      data: { code: 'CP-A', name: 'Synthetic', trainers: { create: [{ trainerId: tr.id }] } },
    });
    learner = await registerLearner(app, '+915599920101');
    await http()
      .put('/v1/me/profile')
      .set(me())
      .send({
        firstName: 'Test-Ravi',
        districtCode: 'warangal',
        tradeCode: 'electrician',
        selfDeclaredLevel: 'none',
      })
      .expect(200);
    await http().post('/v1/me/batch').set(me()).send({ code: 'CP-A' }).expect(200);
  });

  const passLesson = () =>
    http()
      .post('/v1/sync')
      .set(me())
      .send({
        attempts: [
          {
            id: randomUUID(),
            lessonId,
            packVersion: 1,
            score: 1,
            passed: true,
            durationMs: 1000,
            answers: [],
            finishedAt: new Date().toISOString(),
          },
        ],
        activity: [],
      })
      .expect(200);

  it('opens only after every lesson of the level is passed', async () => {
    const before = (await http().get('/v1/checkpoints').set(me()).expect(200)).body;
    expect(before[0]).toMatchObject({
      level: 'A1',
      available: true,
      eligible: false,
      lessons: 1,
      lessonsPassed: 0,
    });
    expect(before[1]).toMatchObject({ level: 'A2', available: false });
    const res = await http().post('/v1/checkpoints/A1/attempts').set(me()).expect(409);
    expect(res.body.code).toBe('lessons_not_passed');
    await passLesson();
    expect((await http().get('/v1/checkpoints').set(me())).body[0]).toMatchObject({
      eligible: true,
    });
    await http().post('/v1/checkpoints/A2/attempts').set(me()).expect(404);
  });

  it('draws questions without answers, resumes the same attempt, and serves only its recordings', async () => {
    await passLesson();
    const a = (await http().post('/v1/checkpoints/A1/attempts').set(me()).expect(200)).body;
    expect(a).toMatchObject({ level: 'A1', status: 'in_progress', passMark: 0.6 });
    expect(a.sections.reading).toHaveLength(2);
    expect(a.sections.listening).toHaveLength(2);
    expect(a.sections.writing).toHaveLength(1);
    // ADR-009: no answer keys or marking guides reach the phone.
    const json = JSON.stringify(a.sections);
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain('explanation');
    expect((await http().post('/v1/checkpoints/A1/attempts').set(me()).expect(200)).body.id).toBe(
      a.id,
    );

    const audio = await http()
      .get(`/v1/checkpoints/attempts/${a.id}/media/${audioId}`)
      .set(me())
      .expect(200);
    expect(audio.headers['content-type']).toBe('audio/ogg');
    await http()
      .get(`/v1/checkpoints/attempts/${a.id}/media/${randomUUID()}`)
      .set(me())
      .expect(404);
    const other = await registerLearner(app, '+915599920102');
    await http()
      .get(`/v1/checkpoints/attempts/${a.id}`)
      .set(as(other.tokens.accessToken))
      .expect(404);
  });

  it('scores reading and listening on the server; a trainer marks writing; then it passes and appears in readiness', async () => {
    await passLesson();
    const a = (await http().post('/v1/checkpoints/A1/attempts').set(me()).expect(200)).body;
    const task = a.sections.writing[0].id;
    // Writing outside the word limits is sent back.
    const short = await http()
      .post(`/v1/checkpoints/attempts/${a.id}/submit`)
      .set(me())
      .send({ answers: {}, writing: { [task]: 'Hallo' } })
      .expect(400);
    expect(short.body).toMatchObject({ code: 'writing_length', minWords: 10 });

    // 3 of 4 right: reading 100%, listening 50%.
    const done = (
      await http()
        .post(`/v1/checkpoints/attempts/${a.id}/submit`)
        .set(me())
        .send({ answers: answersFor(a.sections, (i) => i !== 3), writing: { [task]: essay } })
        .expect(200)
    ).body;
    expect(done).toMatchObject({ status: 'awaiting_marking', total: null, sections: null });
    expect(done.sectionScores).toEqual({ reading: 1, listening: 0.5 });
    await http()
      .post(`/v1/checkpoints/attempts/${a.id}/submit`)
      .set(me())
      .send({ answers: {}, writing: { [task]: essay } })
      .expect(409);

    // The batch's trainer sees it with the text and the guide; another trainer does not.
    const queue = (await http().get('/v1/admin/marking').set(as(trainer)).expect(200)).body;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: a.id,
      level: 'A1',
      learnerName: 'Test-Ravi',
      batchCode: 'CP-A',
    });
    expect(queue[0].tasks[0]).toMatchObject({
      id: task,
      text: essay,
      guide: { en: expect.any(String) },
    });
    expect((await http().get('/v1/admin/marking').set(as(otherTrainer)).expect(200)).body).toEqual(
      [],
    );
    await http()
      .post(`/v1/admin/marking/${a.id}`)
      .set(as(otherTrainer))
      .send({ marks: { [task]: { score: 1 } } })
      .expect(404);
    await http()
      .post(`/v1/admin/marking/${a.id}`)
      .set(as(trainer))
      .send({ marks: { [task]: { score: 1.5 } } })
      .expect(400);

    const marked = (
      await http()
        .post(`/v1/admin/marking/${a.id}`)
        .set(as(trainer))
        .send({ marks: { [task]: { score: 0.7, comment: 'Gut' } } })
        .expect(200)
    ).body;
    // (1 + 0.5 + 0.7) / 3 = 0.733 ≥ 0.6
    expect(marked.status).toBe('passed');
    expect(marked.total).toBeCloseTo(0.7333, 3);
    expect((await http().get(`/v1/checkpoints/attempts/${a.id}`).set(me())).body).toMatchObject({
      status: 'passed',
    });
    expect((await http().get('/v1/checkpoints').set(me())).body[0]).toMatchObject({ passed: true });

    // FR-907: the readiness list (scoped) and its Excel export.
    const ready = (
      await http().get('/v1/admin/readiness').query({ level: 'A1' }).set(as(trainer)).expect(200)
    ).body;
    expect(ready).toEqual([
      expect.objectContaining({
        learnerId: learner.user.id,
        level: 'A1',
        batchCode: 'CP-A',
        districtCode: 'warangal',
      }),
    ]);
    expect(
      (await http().get('/v1/admin/readiness').set(as(otherTrainer)).expect(200)).body,
    ).toEqual([]);
    const file = await http()
      .get('/v1/admin/reports/readiness.xlsx')
      .query({ level: 'A1' })
      .set(as(admin))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.body as unknown as ArrayBuffer);
    const sheet = book.worksheets[0]!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(1).value).toBe('Test-Ravi');
    expect(sheet.getRow(2).getCell(6).value).toBeCloseTo(0.7333, 3);
    expect(
      await prisma.db.auditLog.count({ where: { action: 'checkpoint_mark', entityId: a.id } }),
    ).toBe(1);
  });

  it('fails below the pass mark without waiting for marking when there is no writing', async () => {
    const noWriting = { ...content, draw: { ...content.draw, writing: 0 } };
    await prisma.db.checkpoint.updateMany({ data: { publishedContent: noWriting } });
    await passLesson();
    const a = (await http().post('/v1/checkpoints/A1/attempts').set(me()).expect(200)).body;
    const res = (
      await http()
        .post(`/v1/checkpoints/attempts/${a.id}/submit`)
        .set(me())
        .send({ answers: answersFor(a.sections, (i) => i === 0), writing: {} })
        .expect(200)
    ).body;
    // reading 50%, listening 0% → 25%
    expect(res).toMatchObject({ status: 'failed', total: 0.25 });
    expect((await http().get('/v1/admin/readiness').set(as(admin))).body).toEqual([]);
  });

  it('closes an expired attempt instead of scoring it', async () => {
    await passLesson();
    const a = (await http().post('/v1/checkpoints/A1/attempts').set(me()).expect(200)).body;
    await prisma.db.checkpointAttempt.update({
      where: { id: a.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await http()
      .post(`/v1/checkpoints/attempts/${a.id}/submit`)
      .set(me())
      .send({ answers: {}, writing: {} })
      .expect(409);
    expect(res.body.code).toBe('attempt_expired');
  });
});
