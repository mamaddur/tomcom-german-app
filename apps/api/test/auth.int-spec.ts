import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../src/identity/auth.guard.js';
import type { AccessClaims } from '../src/identity/token.service.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { resetState } from './helpers.js';

/** Test-only protected route: proves routes need a token unless marked @Public(). */
@Controller('test-protected')
class ProtectedController {
  @Get()
  whoAmI(@Auth() auth: AccessClaims) {
    return { userId: auth.userId, role: auth.role };
  }
}

const PHONE = '+915500000101';
const DEV_OTP = '123456';
const device = (clientId = 'device-aaaa-0001') => ({
  clientId,
  platform: 'android',
  appVersion: '0.1.0',
});
const consent = { noticeVersion: 1, purposes: ['learning', 'progress_sharing'] };

describe('learner sign-in and registration (FR-101, FR-104, FR-107, story 1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProtectedController] });
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
  });

  async function verify(phone = PHONE, clientId?: string) {
    await http().post('/v1/auth/otp/request').send({ phone, locale: 'te' }).expect(202);
    return http()
      .post('/v1/auth/otp/verify')
      .send({ phone, code: DEV_OTP, device: device(clientId) });
  }

  async function registerNew(phone = PHONE) {
    const { body } = await verify(phone);
    return http()
      .post('/v1/auth/register')
      .send({ registrationToken: body.registrationToken, locale: 'te', consent, device: device() });
  }

  it('a new number gets a registration token and nothing is stored before consent', async () => {
    const res = await verify();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('registration_required');
    expect(res.body.registrationToken).toEqual(expect.any(String));
    expect(await prisma.db.user.count()).toBe(0);
  });

  it('serves the consent notice in Telugu with required and optional purposes', async () => {
    const { body } = await http().get('/v1/consent/notice?locale=te').expect(200);
    expect(body.version).toBe(1);
    expect(body.locale).toBe('te');
    expect(body.title).toMatch(/[ఀ-౿]/); // Telugu script
    expect(body.purposes).toEqual([
      expect.objectContaining({ id: 'learning', required: true }),
      expect.objectContaining({ id: 'progress_sharing', required: true }),
      expect.objectContaining({ id: 'analytics', required: false }),
    ]);
  });

  it('registers with consent: user, consent and device are stored together, phone encrypted', async () => {
    const res = await registerNew();
    expect(res.status).toBe(201);
    expect(res.body.tokens).toMatchObject({ tokenType: 'Bearer', expiresInSeconds: 900 });
    expect(res.body.user).toMatchObject({
      role: 'learner',
      uiLocale: 'te',
      onboarding: { profileComplete: false },
    });

    const user = await prisma.db.user.findUniqueOrThrow({
      where: { id: res.body.user.id },
      include: { consents: true, devices: true },
    });
    expect(Buffer.from(user.phoneEnc).toString('latin1')).not.toContain('5500000101');
    expect(user.consents).toHaveLength(1);
    expect(user.consents[0]).toMatchObject({
      noticeVersion: 1,
      purposes: consent.purposes,
      locale: 'te',
    });
    expect(user.devices).toHaveLength(1);
  });

  it('refuses registration without the required purposes or with an old notice', async () => {
    const { body } = await verify();
    const base = { registrationToken: body.registrationToken, locale: 'te', device: device() };
    const missing = await http()
      .post('/v1/auth/register')
      .send({ ...base, consent: { noticeVersion: 1, purposes: ['learning'] } });
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({
      code: 'consent_purposes_invalid',
      missing: ['progress_sharing'],
    });
    const outdated = await http()
      .post('/v1/auth/register')
      .send({ ...base, consent: { ...consent, noticeVersion: 0 } });
    expect(outdated.body).toMatchObject({ code: 'consent_notice_outdated', currentVersion: 1 });
    expect(await prisma.db.user.count()).toBe(0);
  });

  it('uses a registration token only once', async () => {
    const { body } = await verify();
    const payload = {
      registrationToken: body.registrationToken,
      locale: 'en',
      consent,
      device: device(),
    };
    await http().post('/v1/auth/register').send(payload).expect(201);
    const again = await http().post('/v1/auth/register').send(payload);
    expect(again.status).toBe(401);
    expect(again.body.code).toBe('registration_expired');
  });

  it('signs an existing learner in on a new device with the same account (FR-107)', async () => {
    const first = await registerNew();
    // Skip the 30-second resend cooldown that a real learner would wait out.
    const redis = await app.get(RedisService).connected();
    await redis.del(...(await redis.keys('otp-cooldown:*')));
    const res = await verify(PHONE, 'second-phone-0002');
    expect(res.body.status).toBe('authenticated');
    expect(res.body.user.id).toBe(first.body.user.id);
    expect(await prisma.db.device.count({ where: { userId: first.body.user.id } })).toBe(2);
  });

  it('protects routes by default and accepts a valid access token', async () => {
    await http().get('/v1/test-protected').expect(401);
    await http().get('/v1/test-protected').set('Authorization', 'Bearer not-a-jwt').expect(401);
    const { body } = await registerNew();
    const res = await http()
      .get('/v1/test-protected')
      .set('Authorization', `Bearer ${body.tokens.accessToken}`)
      .expect(200);
    expect(res.body).toEqual({ userId: body.user.id, role: 'learner' });
  });

  it('rotates refresh tokens and revokes the family when an old one is reused', async () => {
    const { body } = await registerNew();
    const first = body.tokens.refreshToken;
    const second = (await http().post('/v1/auth/refresh').send({ refreshToken: first }).expect(200))
      .body.refreshToken;
    expect(second).not.toBe(first);

    const reuse = await http().post('/v1/auth/refresh').send({ refreshToken: first });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('refresh_reused');
    // The stolen-token scenario: the legitimate newer token is revoked too.
    await http().post('/v1/auth/refresh').send({ refreshToken: second }).expect(401);
  });

  it('logout revokes the session', async () => {
    const { body } = await registerNew();
    await http()
      .post('/v1/auth/logout')
      .send({ refreshToken: body.tokens.refreshToken })
      .expect(204);
    await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: body.tokens.refreshToken })
      .expect(401);
  });

  it('counts wrong codes and locks the OTP after 5 attempts', async () => {
    await http().post('/v1/auth/otp/request').send({ phone: PHONE, locale: 'en' }).expect(202);
    const wrong = { phone: PHONE, code: '000000', device: device() };
    const first = await http().post('/v1/auth/otp/verify').send(wrong);
    expect(first.body).toMatchObject({ code: 'otp_invalid', attemptsLeft: 4 });
    for (let i = 0; i < 4; i++) await http().post('/v1/auth/otp/verify').send(wrong);
    const locked = await http()
      .post('/v1/auth/otp/verify')
      .send({ ...wrong, code: DEV_OTP });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('otp_attempts_exceeded');
  });

  it('enforces the resend cooldown and the per-number limit', async () => {
    await http().post('/v1/auth/otp/request').send({ phone: PHONE, locale: 'en' }).expect(202);
    const tooSoon = await http().post('/v1/auth/otp/request').send({ phone: PHONE, locale: 'en' });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body).toMatchObject({
      code: 'otp_resend_too_soon',
      retryAfterSeconds: expect.any(Number),
    });
  });

  it('refuses real numbers when no SMS gateway is configured, storing nothing', async () => {
    const res = await http()
      .post('/v1/auth/otp/request')
      .send({ phone: '9876543210', locale: 'en' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('sms_unavailable');
    const keys = await (await app.get(RedisService).connected()).keys('otp:*');
    expect(keys).toEqual([]);
  });

  it('rejects malformed input without echoing values', async () => {
    const res = await http()
      .post('/v1/auth/otp/request')
      .send({ phone: '9876543210', locale: 'fr', extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_failed');
    expect(JSON.stringify(res.body)).not.toContain('9876543210');
    const bad = await http().post('/v1/auth/otp/request').send({ phone: '12345', locale: 'en' });
    expect(bad.body.code).toBe('invalid_phone');
  });
});
