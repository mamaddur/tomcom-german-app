import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import {
  createStaff,
  DEV_OTP,
  device,
  registerLearner,
  resetState,
  staffLogin,
} from './helpers.js';

const ADMIN = '+915599000001';
const TRAINER = '+915599000002';
const LEARNER = '+915500000301';

describe('staff sign-in with two factors, roles and audit (NFR-10, NFR-11, FR-909)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const clearCooldowns = async () => {
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    await createStaff(app, 'super_admin', ADMIN);
    await createStaff(app, 'trainer', TRAINER);
  });

  it('needs the password and then the OTP; staff sessions use the 5-minute access policy', async () => {
    const session = await staffLogin(app, ADMIN);
    expect(session.tokens.expiresInSeconds).toBe(300);
    const row = await prisma.db.refreshToken.findFirstOrThrow({
      where: { userId: session.user.id },
    });
    const idleMinutes = (row.expiresAt.getTime() - Date.now()) / 60_000;
    expect(idleMinutes).toBeGreaterThan(24);
    expect(idleMinutes).toBeLessThanOrEqual(25);
  });

  it('answers the same for an unknown number and a wrong password', async () => {
    const unknown = await http()
      .post('/v1/staff-auth/login')
      .send({ phone: '+915599000099', password: 'whatever-password' });
    const wrong = await http()
      .post('/v1/staff-auth/login')
      .send({ phone: ADMIN, password: 'not the password' });
    expect([unknown.status, wrong.status]).toEqual([401, 401]);
    expect(unknown.body.code).toBe('invalid_credentials');
    expect(wrong.body.code).toBe('invalid_credentials');
  });

  it('locks the account after 5 wrong passwords, even for the right one', async () => {
    for (let i = 0; i < 5; i++)
      await http()
        .post('/v1/staff-auth/login')
        .send({ phone: ADMIN, password: `wrong-${i}-password` });
    const res = await http()
      .post('/v1/staff-auth/login')
      .send({ phone: ADMIN, password: 'correct horse battery' });
    expect(res.status).toBe(423);
    expect(res.body).toMatchObject({
      code: 'account_locked',
      retryAfterSeconds: expect.any(Number),
    });
  });

  it('does not let staff skip the password through the learner OTP login', async () => {
    await http().post('/v1/auth/otp/request').send({ phone: ADMIN, locale: 'en' }).expect(202);
    const res = await http()
      .post('/v1/auth/otp/verify')
      .send({ phone: ADMIN, code: DEV_OTP, device: device() });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('use_staff_login');
  });

  it('does not let learners use the staff login', async () => {
    await registerLearner(app, LEARNER);
    const res = await http()
      .post('/v1/staff-auth/login')
      .send({ phone: LEARNER, password: 'any-password-123' });
    expect(res.body.code).toBe('invalid_credentials');
  });

  it('ends an idle staff session (30-minute admin timeout)', async () => {
    const session = await staffLogin(app, ADMIN);
    await prisma.db.refreshToken.updateMany({
      where: { userId: session.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: session.tokens.refreshToken })
      .expect(401);
  });

  it('caps a staff session at 12 hours however active it is', async () => {
    const session = await staffLogin(app, ADMIN);
    const elevenHours59 = new Date(Date.now() - (12 * 60 - 1) * 60_000);
    await prisma.db.refreshToken.updateMany({
      where: { userId: session.user.id },
      data: { createdAt: elevenHours59 },
    });
    await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: session.tokens.refreshToken })
      .expect(200);
    const newest = await prisma.db.refreshToken.findFirstOrThrow({
      where: { userId: session.user.id, revokedAt: null },
    });
    expect(newest.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(61_000);
  });

  it('lets only super admins read the audit log, which records logins and staff changes', async () => {
    const learner = await registerLearner(app, LEARNER);
    await clearCooldowns();
    const trainer = await staffLogin(app, TRAINER);
    await clearCooldowns();
    const admin = await staffLogin(app, ADMIN);
    const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

    await http().get('/v1/admin/audit-log').set(bearer(learner.tokens.accessToken)).expect(403);
    await http().get('/v1/admin/audit-log').set(bearer(trainer.tokens.accessToken)).expect(403);

    // A staff change is audited by route and outcome; a learner change is not.
    await http()
      .put('/v1/me/locale')
      .set(bearer(trainer.tokens.accessToken))
      .send({ locale: 'te' })
      .expect(200);
    await http()
      .put('/v1/me/locale')
      .set(bearer(learner.tokens.accessToken))
      .send({ locale: 'en' })
      .expect(200);

    const log = (
      await http()
        .get('/v1/admin/audit-log?limit=200')
        .set(bearer(admin.tokens.accessToken))
        .expect(200)
    ).body;
    const mine = (id: string) => log.filter((e: { actorId: string }) => e.actorId === id);
    expect(
      mine(trainer.user.id).map(
        (e: { action: string; outcome: string }) => `${e.action} ${e.outcome}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        'staff_login_password success',
        'staff_login success',
        'PUT /v1/me/locale success',
      ]),
    );
    expect(mine(learner.user.id)).toEqual([]);
    expect(JSON.stringify(log)).not.toMatch(/5599000002|5500000301|correct horse/);
  });

  it('keeps the audit log append-only at the database level', async () => {
    await staffLogin(app, ADMIN);
    await expect(prisma.db.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(prisma.db.auditLog.updateMany({ data: { outcome: 'x' } })).rejects.toThrow(
      /append-only/,
    );
  });
});
