import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { RequiresFeature } from '../src/settings/feature.guard.js';
import { createTestApp } from './app.factory.js';
import { createStaff, resetState, staffLogin } from './helpers.js';

@Controller('test-tutor')
class TutorProbeController {
  @Get()
  @RequiresFeature('module.tutor')
  ping() {
    return { ok: true };
  }
}

describe('platform settings and feature flags (FR-1101, FR-1103)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdmin: string;
  let tomcomAdmin: string;
  let superAdminId: string;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(phone: string) {
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
    return (await staffLogin(app, phone)).tokens.accessToken;
  }

  beforeAll(async () => {
    app = await createTestApp({ controllers: [TutorProbeController] });
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    await prisma.db.$executeRaw`TRUNCATE settings, feature_flags`;
    superAdminId = (await createStaff(app, 'super_admin', '+915599400001')).id;
    await createStaff(app, 'tomcom_admin', '+915599400002');
    superAdmin = await login('+915599400001');
    tomcomAdmin = await login('+915599400002');
  });

  it('lists settings with defaults and descriptions', async () => {
    const list = (await http().get('/v1/admin/settings').set(as(tomcomAdmin)).expect(200)).body;
    expect(list).toContainEqual(
      expect.objectContaining({ key: 'quiz.passMark', value: 0.8, default: 0.8 }),
    );
    expect(list).toContainEqual(
      expect.objectContaining({ key: 'reminders.inactivityDays', value: [3, 7] }),
    );
  });

  it('lets a super admin change a setting within its allowed range, and audits old and new values', async () => {
    const res = await http()
      .put('/v1/admin/settings/quiz.passMark')
      .set(as(superAdmin))
      .send({ value: 0.75 })
      .expect(200);
    expect(res.body).toMatchObject({ key: 'quiz.passMark', value: 0.75, default: 0.8 });

    const tooLow = await http()
      .put('/v1/admin/settings/quiz.passMark')
      .set(as(superAdmin))
      .send({ value: 0.3 });
    expect(tooLow.status).toBe(400);
    expect(tooLow.body.code).toBe('setting_value_invalid');
    await http()
      .put('/v1/admin/settings/otp.perPhone')
      .set(as(superAdmin))
      .send({ value: 100 })
      .expect(404);

    const entry = await prisma.db.auditLog.findFirstOrThrow({
      where: { actorId: superAdminId, action: 'setting_change' },
    });
    expect(entry).toMatchObject({
      entityId: 'quiz.passMark',
      details: { before: 0.8, after: 0.75 },
    });
  });

  it('lets TOMCOM admins read but not change settings or flags', async () => {
    await http()
      .put('/v1/admin/settings/quiz.passMark')
      .set(as(tomcomAdmin))
      .send({ value: 0.9 })
      .expect(403);
    await http()
      .put('/v1/admin/feature-flags/module.tutor')
      .set(as(tomcomAdmin))
      .send({ enabled: false })
      .expect(403);
  });

  it('switches a module off: the app config shows it and its routes close', async () => {
    await http().get('/v1/test-tutor').set(as(superAdmin)).expect(200);
    await http()
      .put('/v1/admin/feature-flags/module.tutor')
      .set(as(superAdmin))
      .send({ enabled: false })
      .expect(200);

    const config = (await http().get('/v1/app/config').expect(200)).body;
    expect(config.features['module.tutor']).toBe(false);
    expect(config.limits['tutor.dailyMessageLimit']).toBe(30);
    expect(config.learning).toEqual({
      passMark: 0.8,
      sequentialUnlock: true,
      dailyGoalMinutes: 10,
    });

    const closed = await http().get('/v1/test-tutor').set(as(superAdmin));
    expect(closed.status).toBe(403);
    expect(closed.body).toMatchObject({ code: 'feature_disabled', feature: 'module.tutor' });
  });
});
