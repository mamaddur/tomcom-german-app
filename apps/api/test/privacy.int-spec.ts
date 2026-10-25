import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { registerLearner, resetState } from './helpers.js';

describe('data export and account erasure (FR-804, DPDP Act 2023)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const phone = '+915599700101';
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(() => resetState(app));

  async function learnerWithProfile() {
    const l = await registerLearner(app, phone);
    await prisma.db.batch.create({ data: { code: 'TST-P', name: 'Synthetic P' } });
    await http()
      .put('/v1/me/profile')
      .set(as(l.tokens.accessToken))
      .send({
        firstName: 'Test-Ravi',
        districtCode: 'warangal',
        tradeCode: 'electrician',
        selfDeclaredLevel: 'none',
      })
      .expect(200);
    await http()
      .post('/v1/me/batch')
      .set(as(l.tokens.accessToken))
      .send({ code: 'TST-P' })
      .expect(200);
    return l;
  }

  it('exports the account, profile, consents, batches and learning data, and audits it', async () => {
    const l = await learnerWithProfile();
    const res = await http().get('/v1/me/export').set(as(l.tokens.accessToken)).expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.account).toMatchObject({ phone, firstName: 'Test-Ravi', language: 'te' });
    expect(res.body.profile).toMatchObject({ district: 'warangal', trade: 'electrician' });
    expect(res.body.consents[0]).toMatchObject({ noticeVersion: 1, withdrawnAt: null });
    expect(res.body.batches).toEqual([expect.objectContaining({ code: 'TST-P', leftAt: null })]);
    expect(res.body.devices).toHaveLength(1);
    expect(res.body.quizAttempts).toEqual([]);

    // audit_log is append-only, so earlier runs' rows remain: look up this learner's.
    const audit = await prisma.db.auditLog.findFirst({
      where: { action: 'learner_data_export', entityId: l.user.id },
    });
    expect(audit).toMatchObject({ actorId: l.user.id, outcome: 'success' });
    // The audit row holds ids only, never the exported data.
    expect(JSON.stringify(audit?.details ?? null)).not.toContain(phone);
  });

  it('limits exports to 5 a day', async () => {
    const l = await registerLearner(app, phone);
    for (let i = 0; i < 5; i++) {
      await http().get('/v1/me/export').set(as(l.tokens.accessToken)).expect(200);
    }
    const res = await http().get('/v1/me/export').set(as(l.tokens.accessToken)).expect(429);
    expect(res.body.code).toBe('rate_limited');
  });

  it('erases identity and profile, ends every session, and the number can register again', async () => {
    const l = await learnerWithProfile();
    await http()
      .post('/v1/me/erase')
      .set(as(l.tokens.accessToken))
      .send({ confirm: true })
      .expect(204);

    const user = await prisma.db.user.findUniqueOrThrow({
      where: { id: l.user.id },
      include: {
        profile: true,
        devices: true,
        refreshTokens: true,
        consents: true,
        enrolments: true,
      },
    });
    expect(user).toMatchObject({
      firstName: null,
      lastName: null,
      status: 'deleted',
      profile: null,
    });
    expect(user.phoneEnc.length).toBe(0);
    expect(user.phoneHmac).toBe(`erased:${l.user.id}`);
    expect(user.devices).toEqual([]);
    expect(user.refreshTokens).toEqual([]);
    expect(user.consents.every((c) => c.withdrawnAt !== null)).toBe(true);
    expect(user.enrolments.every((e) => e.leftAt !== null)).toBe(true);

    // The old refresh token no longer works.
    await http().post('/v1/auth/refresh').send({ refreshToken: l.tokens.refreshToken }).expect(401);

    // The same number starts over as a brand-new learner (after the OTP resend wait).
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
    const again = await registerLearner(app, phone);
    expect(again.user.id).not.toBe(l.user.id);

    expect(
      await prisma.db.auditLog.count({
        where: { action: 'learner_account_erased', entityId: l.user.id },
      }),
    ).toBe(1);
  });

  it('needs an explicit confirmation', async () => {
    const l = await registerLearner(app, phone);
    await http().post('/v1/me/erase').set(as(l.tokens.accessToken)).send({}).expect(400);
    await http()
      .post('/v1/me/erase')
      .set(as(l.tokens.accessToken))
      .send({ confirm: 'yes' })
      .expect(400);
  });
});
