import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { createTestApp } from './app.factory.js';
import { registerLearner, resetState } from './helpers.js';

const profile = {
  firstName: 'Test-Ravi',
  lastName: 'Synthetic',
  districtCode: 'warangal',
  tradeCode: 'electrician',
  targetJob: 'Electrician in Germany',
  selfDeclaredLevel: 'none',
};

describe('profile, language and batch (FR-102, FR-103, FR-106)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const http = () => request(app.getHttpServer());
  const authed = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    token = (await registerLearner(app, '+915500000201')).tokens.accessToken;
  });

  it('lists 33 districts and the trades with Telugu and English names', async () => {
    const districts = (await http().get('/v1/reference/districts').expect(200)).body;
    expect(districts).toHaveLength(33);
    expect(districts).toContainEqual({ code: 'warangal', name: { te: 'వరంగల్', en: 'Warangal' } });
    const trades = (await http().get('/v1/reference/trades').expect(200)).body;
    expect(trades.map((t: { code: string }) => t.code)).toContain('electrician');
  });

  it('starts with an incomplete onboarding', async () => {
    const me = (await authed(http().get('/v1/me')).expect(200)).body;
    expect(me).toMatchObject({ uiLocale: 'te', firstName: null, profile: null, batch: null });
    expect(me.onboarding).toEqual({ profileComplete: false, batchJoined: false });
  });

  it('captures the profile (FR-103) and accepts Telugu names', async () => {
    const me = (await authed(http().put('/v1/me/profile')).send(profile).expect(200)).body;
    expect(me).toMatchObject({
      firstName: 'Test-Ravi',
      profile: { districtCode: 'warangal', selfDeclaredLevel: 'none' },
    });
    expect(me.onboarding.profileComplete).toBe(true);
    const telugu = await authed(http().put('/v1/me/profile'))
      .send({ ...profile, firstName: 'రవి' })
      .expect(200);
    expect(telugu.body.firstName).toBe('రవి');
  });

  it('rejects unknown districts and names with digits or symbols', async () => {
    const res = await authed(http().put('/v1/me/profile')).send({
      ...profile,
      districtCode: 'atlantis',
    });
    expect(res.body).toMatchObject({ code: 'unknown_reference', fields: ['districtCode'] });
    const bad = await authed(http().put('/v1/me/profile')).send({
      ...profile,
      firstName: 'Ravi<script>',
    });
    expect(bad.body.code).toBe('validation_failed');
  });

  it('changes the interface language later (FR-102)', async () => {
    const me = (await authed(http().put('/v1/me/locale')).send({ locale: 'en' }).expect(200)).body;
    expect(me.uiLocale).toBe('en');
  });

  it('joins a batch by code, case-insensitively, and moves between batches (FR-106)', async () => {
    const [a, b] = await Promise.all([
      prisma.db.batch.create({ data: { code: 'TST-001', name: 'Synthetic batch 1' } }),
      prisma.db.batch.create({ data: { code: 'TST-002', name: 'Synthetic batch 2' } }),
    ]);
    const joined = (
      await authed(http().post('/v1/me/batch')).send({ code: ' tst-001 ' }).expect(200)
    ).body;
    expect(joined.batch).toMatchObject({ code: 'TST-001', name: 'Synthetic batch 1' });
    expect(joined.onboarding.batchJoined).toBe(true);

    await authed(http().post('/v1/me/batch')).send({ code: 'TST-001' }).expect(200); // idempotent
    await authed(http().post('/v1/me/batch')).send({ code: 'TST-002' }).expect(200);
    const enrolments = await prisma.db.enrolment.findMany({ orderBy: { enrolledAt: 'asc' } });
    expect(enrolments.map((e) => [e.batchId, e.leftAt === null])).toEqual([
      [a.id, false],
      [b.id, true],
    ]);
  });

  it('refuses unknown or closed batches and limits guessing', async () => {
    await prisma.db.batch.create({ data: { code: 'TST-OLD', name: 'Closed', status: 'closed' } });
    expect((await authed(http().post('/v1/me/batch')).send({ code: 'NOPE-1' })).body.code).toBe(
      'batch_not_found',
    );
    expect((await authed(http().post('/v1/me/batch')).send({ code: 'TST-OLD' })).body.code).toBe(
      'batch_closed',
    );
    for (let i = 0; i < 8; i++)
      await authed(http().post('/v1/me/batch')).send({ code: `NOPE-${i}` });
    expect((await authed(http().post('/v1/me/batch')).send({ code: 'NOPE-X' })).status).toBe(429);
  });

  it('keeps profile and batch endpoints for learners and needs a token', async () => {
    await http().get('/v1/me').expect(401);
    await http().put('/v1/me/profile').send(profile).expect(401);
  });
});
