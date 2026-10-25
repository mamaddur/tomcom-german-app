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
