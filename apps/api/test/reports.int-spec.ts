import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { createStaff, registerLearner, resetState, staffLogin } from './helpers.js';

/** FR-902 dashboard, FR-903 filters, FR-904 learner detail, FR-908 scope. Synthetic cohort. */
describe('admin reports', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let trainerA: string;
  let trainerBId: string;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  async function login(phone: string) {
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
    return (await staffLogin(app, phone)).tokens.accessToken;
  }

  async function learner(phone: string, batch: string, district: string, trade: string) {
    const l = await registerLearner(app, phone);
    await http()
      .put('/v1/me/profile')
      .set(as(l.tokens.accessToken))
      .send({
        firstName: `Test-${'ABC'[Number(phone.slice(-1)) - 1]}`,
        districtCode: district,
        tradeCode: trade,
        selfDeclaredLevel: 'none',
      })
      .expect(200);
    await http()
      .post('/v1/me/batch')
      .set(as(l.tokens.accessToken))
      .send({ code: batch })
      .expect(200);
    return l;
  }

  const attempt = (lessonId: string, score: number) => ({
    id: randomUUID(),
    lessonId,
    packVersion: 1,
    score,
    passed: score >= 0.8,
    durationMs: 60_000,
    answers: [],
    finishedAt: new Date().toISOString(),
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetState(app);
    await prisma.db.$executeRaw`TRUNCATE lessons CASCADE`;
    await createStaff(app, 'tomcom_admin', '+915599900001');
    const a = await createStaff(app, 'trainer', '+915599900002');
    const b = await createStaff(app, 'trainer', '+915599900003');
    trainerBId = b.id;
    const author = await createStaff(app, 'author', '+915599900004');
    admin = await login('+915599900001');
    trainerA = await login('+915599900002');
    await prisma.db.batch.create({
      data: { code: 'RPT-A', name: 'Synthetic A', trainers: { create: [{ trainerId: a.id }] } },
    });
    await prisma.db.batch.create({
      data: { code: 'RPT-B', name: 'Synthetic B', trainers: { create: [{ trainerId: b.id }] } },
    });
    const levels = Object.fromEntries(
      (await prisma.db.level.findMany()).map((l) => [l.code, l.id]),
    );
    const lesson = async (level: string, order: number) =>
      (
        await prisma.db.lesson.create({
          data: {
            levelId: levels[level]!,
            order,
            title: { te: `పాఠం ${order}`, en: `Lesson ${order}` },
            description: {},
            estMinutes: 10,
            status: 'published',
            publishedRevision: 1,
            createdBy: author.id,
            updatedBy: author.id,
          },
        })
      ).id;
    ids.l1 = await lesson('A1', 1);
    ids.l2 = await lesson('A1', 2);
    ids.a2 = await lesson('A2', 1);

    const one = await learner('+915599900101', 'RPT-A', 'warangal', 'electrician');
    const two = await learner('+915599900102', 'RPT-A', 'nizamabad', 'electrician');
    const three = await learner('+915599900103', 'RPT-B', 'warangal', 'welder');
    ids.one = one.user.id;
    ids.three = three.user.id;
    const sync = (l: typeof one, attempts: object[], activity: object[] = []) =>
      http()
        .post('/v1/sync')
        .set(as(l.tokens.accessToken))
        .send({ attempts, activity })
        .expect(200);
    await sync(one, [attempt(ids.l1, 0.9), attempt(ids.l2, 1)], [{ date: today, seconds: 600 }]);
    await sync(two, [attempt(ids.l1, 0.8), attempt(ids.l2, 0.5)]);
    await sync(three, [attempt(ids.l1, 0.4)]);
  });
  afterAll(() => app.close());

  const overview = (token: string, q: Record<string, string> = {}) =>
    http().get('/v1/admin/reports/overview').query(q).set(as(token));

  it('dashboard: learners, active learners, attempts, average, completions and drop-off (FR-902)', async () => {
    const o = (await overview(admin).expect(200)).body;
    expect(o).toMatchObject({
      to: today,
      learners: 3,
      activeLearners: 1,
      minutes: 10,
      attempts: 5,
    });
    expect(o.averageScore).toBeCloseTo(0.72, 5);
    expect(o.completions).toEqual([
      { level: 'A1', lessons: 2, completed: 1 },
      { level: 'A2', lessons: 1, completed: 0 },
    ]);
    const [l1, l2, a2] = o.lessons;
    expect(l1).toMatchObject({ lessonId: ids.l1, attempted: 3, passed: 2, dropOff: 0 });
    expect(l2).toMatchObject({ lessonId: ids.l2, attempted: 2, passed: 1, dropOff: 1 });
    expect(l2.averageBestScore).toBeCloseTo(0.75, 5);
    expect(a2).toMatchObject({ level: 'A2', attempted: 0, passed: 0, dropOff: 0 });
  });

  it('filters by district, trade, batch, trainer, level and dates (FR-903)', async () => {
    expect((await overview(admin, { districtCode: 'nizamabad' })).body).toMatchObject({
      learners: 1,
      attempts: 2,
    });
    expect((await overview(admin, { tradeCode: 'welder' })).body).toMatchObject({
      learners: 1,
      attempts: 1,
    });
    expect((await overview(admin, { trainerId: trainerBId })).body).toMatchObject({ learners: 1 });
    const batchA = await prisma.db.batch.findUniqueOrThrow({ where: { code: 'RPT-A' } });
    expect((await overview(admin, { batchId: batchA.id })).body).toMatchObject({
      learners: 2,
      attempts: 4,
    });
    const a2 = (await overview(admin, { level: 'A2' })).body;
    expect(a2).toMatchObject({ attempts: 0 });
    expect(a2.lessons).toHaveLength(1);
    const past = (await overview(admin, { from: '2026-01-01', to: '2026-01-31' })).body;
    expect(past).toMatchObject({ learners: 3, activeLearners: 0, attempts: 0 });
    await overview(admin, { from: '2026-02-01', to: '2026-01-01' }).expect(400);
    await overview(admin, { from: '2024-01-01', to: '2026-01-01' }).expect(400);
    await overview(admin, { batchId: 'nope' }).expect(400);
  });

  it('a trainer sees only their batches in every report (FR-908)', async () => {
    expect((await overview(trainerA).expect(200)).body).toMatchObject({ learners: 2, attempts: 4 });
    const rows = (await http().get('/v1/admin/learners').set(as(trainerA)).expect(200)).body;
    expect(rows.map((r: { batchCode: string }) => r.batchCode)).toEqual(['RPT-A', 'RPT-A']);
    await http().get(`/v1/admin/learners/${ids.three}`).set(as(trainerA)).expect(404);
  });

  it('learner list and detail: attempts, time spent, masked phone (FR-904)', async () => {
    const rows = (await http().get('/v1/admin/learners').set(as(admin)).expect(200)).body;
    expect(rows).toHaveLength(3);
    const one = rows.find((r: { id: string }) => r.id === ids.one);
    expect(one).toMatchObject({
      batchCode: 'RPT-A',
      lessonsPassed: 2,
      minutes: 10,
      districtCode: 'warangal',
    });
    expect(one.averageScore).toBeCloseTo(0.95, 5);

    const d = (await http().get(`/v1/admin/learners/${ids.one}`).set(as(trainerA)).expect(200))
      .body;
    expect(d).toMatchObject({
      id: ids.one,
      phone: '+91 •••••• 0101',
      uiLocale: 'te',
      pronunciation: [],
      tutorUsage: [],
    });
    expect(d.attempts).toHaveLength(2);
    expect(d.attempts[0]).toMatchObject({
      level: 'A1',
      lessonTitle: { en: expect.stringMatching(/^Lesson/) },
    });
    expect(d.activity).toEqual([{ date: today, seconds: 600 }]);
  });
});
