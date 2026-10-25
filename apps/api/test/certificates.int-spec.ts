import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { completeCheckpoint } from './checkpoint-fixtures.js';
import { createStaff, registerLearner, resetState, staffLogin } from './helpers.js';

type Item = { id: string; payload: { options: string[] } };

/** FR-701–FR-705, story 5. Synthetic learner and content. */
describe('certificates', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let learner: { tokens: { accessToken: string }; user: { id: string } };
  let admin: string;
  let trainer: string;
  let lessonId: string;
  let content: ReturnType<typeof completeCheckpoint>;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const me = () => as(learner.tokens.accessToken);
  const binary = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  async function login(phone: string) {
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
    return (await staffLogin(app, phone)).tokens.accessToken;
  }

  /** Passes the lesson and a checkpoint with every answer right. */
  async function pass() {
    await http()
      .post('/v1/sync')
      .set(me())
      .send({
        attempts: [
          {
            id: randomUUID(),
            lessonId,
            packVersion: 1,
            score: 1,
            passed: true,
            durationMs: 1,
            answers: [],
            finishedAt: new Date().toISOString(),
          },
        ],
        activity: [],
      })
      .expect(200);
    const a = (await http().post('/v1/checkpoints/A1/attempts').set(me()).expect(200)).body;
    const all = [...content.sections.reading, ...content.sections.listening];
    const answers = Object.fromEntries(
      [...a.sections.reading, ...a.sections.listening].map((q: Item) => [
        q.id,
        all.find((x) => x.id === q.id)!.answer,
      ]),
    );
    return (
      await http()
        .post(`/v1/checkpoints/attempts/${a.id}/submit`)
        .set(me())
        .send({ answers, writing: {} })
        .expect(200)
    ).body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    await prisma.db.$executeRaw`TRUNCATE lessons, checkpoints, media_assets CASCADE`;
    const author = await createStaff(app, 'author', '+915599930001');
    await createStaff(app, 'tomcom_admin', '+915599930002');
    await createStaff(app, 'trainer', '+915599930003');
    admin = await login('+915599930002');
    trainer = await login('+915599930003');
    const a1 = await prisma.db.level.findUniqueOrThrow({ where: { code: 'A1' } });
    lessonId = (
      await prisma.db.lesson.create({
        data: {
          levelId: a1.id,
          order: 1,
          title: { te: 'పాఠం', en: 'Lesson' },
          description: {},
          estMinutes: 10,
          status: 'published',
          publishedRevision: 1,
          createdBy: author.id,
          updatedBy: author.id,
        },
      })
    ).id;
    const audio = await prisma.db.mediaAsset.create({
      data: {
        type: 'audio',
        storageKey: `test/${randomUUID()}`,
        mime: 'audio/ogg',
        bytes: 1,
        sha256: 'a'.repeat(64),
        createdBy: author.id,
      },
    });
    content = { ...completeCheckpoint(audio.id), draw: { reading: 2, listening: 2, writing: 0 } };
    await prisma.db.checkpoint.create({
      data: {
        levelId: a1.id,
        content,
        updatedBy: author.id,
        publishedContent: content,
        publishedRevision: 1,
        publishedBy: author.id,
        publishedAt: new Date(),
      },
    });
    learner = await registerLearner(app, '+915599930101');
    await http()
      .put('/v1/me/profile')
      .set(me())
      .send({
        firstName: 'Ravi',
        lastName: 'Kumar',
        districtCode: 'warangal',
        tradeCode: 'electrician',
        selfDeclaredLevel: 'none',
      })
      .expect(200);
  });

  it('passing the checkpoint issues the certificate at once, as a PDF with a verify link (FR-701, FR-702)', async () => {
    expect((await pass()).status).toBe('passed');
    const [cert] = (await http().get('/v1/me/certificates').set(me()).expect(200)).body;
    expect(cert).toMatchObject({
      level: 'A1',
      holderName: 'Ravi Kumar',
      score: 1,
      status: 'valid',
    });
    expect(cert.code).toMatch(/^TC-[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(cert.verifyUrl).toBe(`http://localhost:3001/c/${cert.code}`);

    const pdf = await binary(http().get(`/v1/me/certificates/${cert.id}/pdf`).set(me())).expect(
      200,
    );
    expect(pdf.headers['content-disposition']).toContain(`tomcom-certificate-${cert.code}.pdf`);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // Passing again does not issue a second certificate for the level.
    await pass();
    expect((await http().get('/v1/me/certificates').set(me())).body).toHaveLength(1);
  });

  it('anyone can verify a code; it states it is not an exam result (FR-703, FR-705)', async () => {
    await pass();
    const [cert] = (await http().get('/v1/me/certificates').set(me())).body;
    const v = (await http().get(`/v1/certificates/${cert.code.toLowerCase()}`).expect(200)).body;
    expect(v).toMatchObject({
      code: cert.code,
      holderName: 'Ravi Kumar',
      level: 'A1',
      status: 'valid',
      score: 1,
    });
    expect(v.statement.en).toMatch(/not an official German exam result/);
    expect(v.statement.te).toBeTruthy();
    // Nothing else about the learner is exposed.
    expect(Object.keys(v).sort()).toEqual([
      'code',
      'holderName',
      'issuedAt',
      'level',
      'revokedAt',
      'score',
      'statement',
      'status',
    ]);
    await http().get('/v1/certificates/TC-0000000000').expect(404);
    await http().get('/v1/certificates/not-a-code').expect(404);
  });

  it('admins revoke with a reason; the verify page then says revoked (FR-704)', async () => {
    await pass();
    const [cert] = (await http().get('/v1/me/certificates').set(me())).body;
    await http()
      .post(`/v1/admin/certificates/${cert.id}/revoke`)
      .set(as(trainer))
      .send({ reason: 'Wrong learner' })
      .expect(403);
    await http()
      .post(`/v1/admin/certificates/${cert.id}/revoke`)
      .set(as(admin))
      .send({ reason: 'x' })
      .expect(400);
    await http()
      .post(`/v1/admin/certificates/${cert.id}/revoke`)
      .set(as(admin))
      .send({ reason: 'Issued by mistake' })
      .expect(204);
    await http()
      .post(`/v1/admin/certificates/${cert.id}/revoke`)
      .set(as(admin))
      .send({ reason: 'Issued by mistake' })
      .expect(409);
    expect((await http().get(`/v1/certificates/${cert.code}`)).body).toMatchObject({
      status: 'revoked',
    });
    await http().get(`/v1/me/certificates/${cert.id}/pdf`).set(me()).expect(409);
    const list = (await http().get('/v1/admin/certificates').set(as(admin)).expect(200)).body;
    expect(list[0]).toMatchObject({
      code: cert.code,
      status: 'revoked',
      revokeReason: 'Issued by mistake',
    });
    expect(
      await prisma.db.auditLog.count({
        where: { action: 'certificate_revoke', entityId: cert.id },
      }),
    ).toBe(1);
  });

  it('after the learner erases their account, the certificate verifies without the name (FR-804)', async () => {
    await pass();
    const [cert] = (await http().get('/v1/me/certificates').set(me())).body;
    await http().post('/v1/me/erase').set(me()).send({ confirm: true }).expect(204);
    expect((await http().get(`/v1/certificates/${cert.code}`)).body).toMatchObject({
      holderName: null,
      status: 'valid',
    });
  });
});
