import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { completeCheckpoint } from './checkpoint-fixtures.js';
import { createStaff, registerLearner, resetState, staffLogin } from './helpers.js';

describe('checkpoint authoring (FR-404, FR-1003)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let author: string;
  let reviewer: string;
  let audioId: string;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(phone: string) {
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
    return (await staffLogin(app, phone)).tokens.accessToken;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    await prisma.db.$executeRaw`TRUNCATE checkpoints, media_assets`;
    const a = await createStaff(app, 'author', '+915599910001');
    await createStaff(app, 'reviewer', '+915599910002');
    author = await login('+915599910001');
    reviewer = await login('+915599910002');
    audioId = (
      await prisma.db.mediaAsset.create({
        data: {
          type: 'audio',
          storageKey: `test/${randomUUID()}.opus`,
          mime: 'audio/ogg',
          bytes: 1000,
          sha256: 'a'.repeat(64),
          createdBy: a.id,
        },
      })
    ).id;
  });

  const save = (token: string, revision: number, content: object) =>
    http()
      .put('/v1/studio/checkpoints/A1')
      .set(as(token))
      .send({ expectedRevision: revision, content });

  it('starts empty with problems listed, and saves drafts with optimistic locking', async () => {
    const empty = (await http().get('/v1/studio/checkpoints/A1').set(as(author)).expect(200)).body;
    expect(empty).toMatchObject({ level: 'A1', revision: 0, publishedRevision: null });
    expect(empty.problems.join()).toMatch(/reading: the bank has 0, an attempt draws 10/);

    const draft = { ...empty.content, passMark: 0.7 };
    expect((await save(author, 0, draft).expect(200)).body).toMatchObject({ revision: 1 });
    const stale = await save(author, 0, draft).expect(409);
    expect(stale.body).toMatchObject({ code: 'revision_conflict', currentRevision: 1 });
    expect(
      (await http().get('/v1/studio/checkpoints').set(as(reviewer)).expect(200)).body,
    ).toHaveLength(3);
  });

  it('a reviewer publishes only a complete checkpoint; later edits do not change what learners take', async () => {
    await save(author, 0, completeCheckpoint(audioId, 1)).expect(200);
    const blocked = await http()
      .post('/v1/studio/checkpoints/A1/publish')
      .set(as(reviewer))
      .expect(422);
    expect(blocked.body.errors.join()).toMatch(/reading: the bank has 1, an attempt draws 2/);

    const full = completeCheckpoint(audioId);
    await save(author, 1, full).expect(200);
    await http().post('/v1/studio/checkpoints/A1/publish').set(as(author)).expect(403);
    const published = (
      await http().post('/v1/studio/checkpoints/A1/publish').set(as(reviewer)).expect(200)
    ).body;
    expect(published).toMatchObject({ revision: 2, publishedRevision: 2, problems: [] });

    await save(author, 2, { ...full, passMark: 0.9 }).expect(200);
    const row = await prisma.db.checkpoint.findFirstOrThrow();
    expect((row.publishedContent as { passMark: number }).passMark).toBe(0.6);
    expect(row.publishedRevision).toBe(2);
    expect(
      await prisma.db.auditLog.count({
        where: { action: 'checkpoint_publish', actorId: row.publishedBy },
      }),
    ).toBeGreaterThan(0);
  });

  it('refuses a recording that is not an uploaded audio file', async () => {
    const c = completeCheckpoint(randomUUID());
    await save(author, 0, c).expect(200);
    const res = await http()
      .post('/v1/studio/checkpoints/A1/publish')
      .set(as(reviewer))
      .expect(422);
    expect(res.body.errors.join()).toMatch(/recording that does not exist/);
  });

  it('rejects a malformed draft and keeps learners and reviewers from editing', async () => {
    await save(author, 0, { passMark: 0.6 }).expect(400);
    await save(author, 0, { ...completeCheckpoint(audioId), extra: 1 }).expect(400);
    await save(reviewer, 0, completeCheckpoint(audioId)).expect(403);
    const learner = await registerLearner(app, '+915599910101');
    await http().get('/v1/studio/checkpoints/A1').set(as(learner.tokens.accessToken)).expect(403);
    await http().get('/v1/studio/checkpoints/C2').set(as(author)).expect(400);
  });
});
