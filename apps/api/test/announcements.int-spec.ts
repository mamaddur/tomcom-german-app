import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { createTestApp } from './app.factory.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createStaff, registerLearner, resetState, staffLogin } from './helpers.js';

describe('announcements banner (FR-205)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const text = (en: string) => ({ te: `${en} (te)`, en });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(() => resetState(app));

  it("shows current announcements for everyone and for the learner's batch, newest first", async () => {
    const admin = (await createStaff(app, 'tomcom_admin', '+915599500001')).id;
    const [mine, other] = await Promise.all(
      ['TST-A', 'TST-B'].map((code) =>
        prisma.db.batch.create({ data: { code, name: `Synthetic ${code}` } }),
      ),
    );
    const learner = await registerLearner(app, '+915599500101');
    await http()
      .post('/v1/me/batch')
      .set(as(learner.tokens.accessToken))
      .send({ code: 'TST-A' })
      .expect(200);

    const hour = 3600_000;
    const at = (h: number) => new Date(Date.now() + h * hour);
    await prisma.db.announcement.createMany({
      data: [
        { title: text('Everyone'), body: text('b'), startsAt: at(-3), createdBy: admin },
        {
          title: text('My batch'),
          body: text('b'),
          startsAt: at(-1),
          batchId: mine!.id,
          createdBy: admin,
        },
        {
          title: text('Other batch'),
          body: text('b'),
          startsAt: at(-1),
          batchId: other!.id,
          createdBy: admin,
        },
        {
          title: text('Expired'),
          body: text('b'),
          startsAt: at(-5),
          endsAt: at(-2),
          createdBy: admin,
        },
        { title: text('Not yet'), body: text('b'), startsAt: at(2), createdBy: admin },
      ],
    });

    const list = (
      await http().get('/v1/announcements').set(as(learner.tokens.accessToken)).expect(200)
    ).body as Array<{ title: { en: string; te: string } }>;
    expect(list.map((a) => a.title.en)).toEqual(['My batch', 'Everyone']);
    expect(list[0]!.title.te).toBe('My batch (te)');
  });

  it('needs a learner session', async () => {
    await http().get('/v1/announcements').expect(401);
  });

  describe('sending from the portal (FR-906)', () => {
    const msg = (en: string) => ({ title: text(en), body: text(`${en} body`) });
    async function login(phone: string) {
      const redis = await app.get(RedisService).connected();
      const keys = await redis.keys('otp-cooldown:*');
      if (keys.length) await redis.del(...keys);
      return (await staffLogin(app, phone)).tokens.accessToken;
    }

    it('admins announce to everyone; trainers only to their own batches; learners see them', async () => {
      await createStaff(app, 'tomcom_admin', '+915599500011');
      const trainer = await createStaff(app, 'trainer', '+915599500012');
      const admin = await login('+915599500011');
      const tr = await login('+915599500012');
      const mine = await prisma.db.batch.create({
        data: {
          code: 'ANN-A',
          name: 'Synthetic',
          trainers: { create: [{ trainerId: trainer.id }] },
        },
      });
      const other = await prisma.db.batch.create({ data: { code: 'ANN-B', name: 'Synthetic' } });
      const learner = await registerLearner(app, '+915599500111');
      await http()
        .post('/v1/me/batch')
        .set(as(learner.tokens.accessToken))
        .send({ code: 'ANN-A' })
        .expect(200);

      const all = (
        await http().post('/v1/admin/announcements').set(as(admin)).send(msg('Holiday')).expect(201)
      ).body;
      expect(all).toMatchObject({ batchCode: null, active: true });
      await http()
        .post('/v1/admin/announcements')
        .set(as(tr))
        .send({ ...msg('Class moved'), batchId: mine.id })
        .expect(201);
      await http().post('/v1/admin/announcements').set(as(tr)).send(msg('To all')).expect(403);
      await http()
        .post('/v1/admin/announcements')
        .set(as(tr))
        .send({ ...msg('Other'), batchId: other.id })
        .expect(403);
      // Both languages are required.
      await http()
        .post('/v1/admin/announcements')
        .set(as(admin))
        .send({ title: { en: 'Only English' }, body: text('b') })
        .expect(400);

      const seen = (
        await http().get('/v1/announcements').set(as(learner.tokens.accessToken)).expect(200)
      ).body;
      expect(seen.map((a: { title: { en: string } }) => a.title.en).sort()).toEqual([
        'Class moved',
        'Holiday',
      ]);

      // The trainer's list holds only their batch's announcements.
      const trList = (await http().get('/v1/admin/announcements').set(as(tr)).expect(200)).body;
      expect(trList.map((a: { batchCode: string }) => a.batchCode)).toEqual(['ANN-A']);
      await http().delete(`/v1/admin/announcements/${all.id}`).set(as(tr)).expect(404);

      await http().delete(`/v1/admin/announcements/${all.id}`).set(as(admin)).expect(204);
      const after = (
        await http().get('/v1/announcements').set(as(learner.tokens.accessToken)).expect(200)
      ).body;
      expect(after.map((a: { title: { en: string } }) => a.title.en)).toEqual(['Class moved']);
      expect(
        await prisma.db.auditLog.count({
          where: { entityId: all.id, action: { startsWith: 'announcement_' } },
        }),
      ).toBe(2);
    });
  });
});
