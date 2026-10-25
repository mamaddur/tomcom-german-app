import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';

export const DEV_OTP = '123456';
export const device = (clientId = 'device-aaaa-0001') => ({
  clientId,
  platform: 'android',
  appVersion: '0.1.0',
});
export const consent = { noticeVersion: 1, purposes: ['learning', 'progress_sharing'] };

/** Empties Redis and every user-owned table (synthetic test data only). */
export async function resetState(app: INestApplication): Promise<void> {
  await (await app.get(RedisService).connected()).flushdb();
  await app.get(PrismaService).db.$executeRaw`TRUNCATE users, batches CASCADE`;
}

/** Registers a synthetic learner through the real API and returns their session. */
export async function registerLearner(app: INestApplication, phone: string, locale = 'te') {
  const http = request(app.getHttpServer());
  await http.post('/v1/auth/otp/request').send({ phone, locale }).expect(202);
  const verify = await request(app.getHttpServer())
    .post('/v1/auth/otp/verify')
    .send({ phone, code: DEV_OTP, device: device() })
    .expect(200);
  const res = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({ registrationToken: verify.body.registrationToken, locale, consent, device: device() })
    .expect(201);
  return res.body as {
    tokens: { accessToken: string; refreshToken: string };
    user: { id: string };
  };
}

/** Creates a synthetic staff account directly (the portal flow for this comes in step 9). */
export async function createStaff(
  app: INestApplication,
  role: 'trainer' | 'tomcom_admin' | 'author' | 'reviewer' | 'super_admin',
  phone: string,
  password = 'correct horse battery',
) {
  const { PiiCryptoService } = await import('../src/common/pii-crypto.service.js');
  const { hashPassword } = await import('../src/identity/passwords.js');
  const crypto = app.get(PiiCryptoService);
  return app.get(PrismaService).db.user.create({
    data: {
      role,
      phoneHmac: crypto.hmac(phone),
      phoneEnc: new Uint8Array(crypto.encrypt(phone)),
      firstName: 'Test-Staff',
      uiLocale: 'en',
      credential: { create: { passwordHash: await hashPassword(password) } },
    },
  });
}

/** Full staff sign-in: password, then OTP. */
export async function staffLogin(
  app: INestApplication,
  phone: string,
  password = 'correct horse battery',
) {
  const login = await request(app.getHttpServer())
    .post('/v1/staff-auth/login')
    .send({ phone, password })
    .expect(200);
  const res = await request(app.getHttpServer())
    .post('/v1/staff-auth/verify')
    .send({
      challengeToken: login.body.challengeToken,
      code: DEV_OTP,
      device: device('admin-browser-01'),
    })
    .expect(200);
  return res.body as {
    tokens: { accessToken: string; refreshToken: string; expiresInSeconds: number };
    user: { id: string };
  };
}
