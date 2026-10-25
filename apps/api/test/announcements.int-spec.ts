import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { createTestApp } from './app.factory.js';
import { createStaff, registerLearner, resetState } from './helpers.js';

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
});
