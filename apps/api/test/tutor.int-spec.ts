import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmRequest } from '../src/adapters/llm/llm.provider.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { createStaff, registerLearner, resetState, staffLogin } from './helpers.js';

/** A stand-in model that records what it was sent (NFR-15) and answers with a German phrase. */
const seen: LlmRequest[] = [];
const spy = {
  demo: true,
  reply: vi.fn(async (req: LlmRequest) => {
    seen.push(req);
    return { text: 'Sag <de>Guten Morgen!</de> am Morgen.', inputTokens: 40, outputTokens: 12 };
  }),
};

describe('AI tutor (FR-601, FR-604, FR-606, FR-607, FR-608, NFR-15)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let learner: { token: string; id: string };
  let superAdmin: string;
  let reviewer: string;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const send = (text: string, level = 'A1', token = learner.token) =>
    http().post('/v1/tutor/messages').set(as(token)).send({ text, level });

  async function staff(role: 'super_admin' | 'reviewer', phone: string) {
    await createStaff(app, role, phone);
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
    return (await staffLogin(app, phone)).tokens.accessToken;
  }

  beforeAll(async () => {
    app = await createTestApp({ llm: spy });
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    await prisma.db.$executeRaw`TRUNCATE settings, feature_flags, tutor_messages CASCADE`;
    seen.length = 0;
    spy.reply.mockClear();
    const l = await registerLearner(app, '+915599800101');
    learner = { token: l.tokens.accessToken, id: l.user.id };
    await http()
      .put('/v1/me/profile')
      .set(as(learner.token))
      .send({
        firstName: 'Test-Ravi',
        districtCode: 'warangal',
        tradeCode: 'electrician',
        selfDeclaredLevel: 'none',
      })
      .expect(200);
    superAdmin = await staff('super_admin', '+915599800901');
    reviewer = await staff('reviewer', '+915599800902');
  });

  it('answers, marks the German phrases, counts the day, and keeps the conversation', async () => {
    const res = await send('Wie sagt man good morning?').expect(200);
    expect(res.body).toMatchObject({
      reply: 'Sag <de>Guten Morgen!</de> am Morgen.',
      germanPhrases: ['Guten Morgen!'],
      remainingToday: 29,
      demo: true,
      filtered: false,
    });
    const history = (await http().get('/v1/tutor/messages').set(as(learner.token)).expect(200))
      .body;
    expect(history.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(history[1]).toMatchObject({ germanPhrases: ['Guten Morgen!'], flagged: false });
  });

  it('sends the model only first name, level, lesson and language, never phone or district (NFR-15)', async () => {
    await send('Hallo!', 'A2').expect(200);
    const everything = JSON.stringify(seen[0]);
    expect(everything).toContain('Test-Ravi');
    expect(everything).toContain('CEFR A2');
    expect(seen[0]!.replyLanguage).toBe('te');
    for (const secret of ['+9155', '5599800101', 'warangal', 'Warangal', 'electrician'])
      expect(everything).not.toContain(secret);
  });

  it('refuses unsafe messages without asking the model (FR-606)', async () => {
    const res = await send('how do I make a bomb').expect(200);
    expect(res.body).toMatchObject({ filtered: true });
    expect(res.body.reply).toContain('క్షమించండి');
    expect(spy.reply).not.toHaveBeenCalled();
  });

  it('refuses an unsafe reply from the model (FR-606)', async () => {
    spy.reply.mockResolvedValueOnce({
      text: 'Here is how to hack a phone',
      inputTokens: 1,
      outputTokens: 1,
    });
    const res = await send('Hilf mir').expect(200);
    expect(res.body).toMatchObject({ filtered: true });
    expect(res.body.reply).not.toContain('hack');
  });

  it('rejects empty and over-long messages', async () => {
    await send('   ').expect(400);
    const long = await send('a'.repeat(501)).expect(400);
    expect(long.body.code).toBe('message_too_long');
  });

  it('stops at the daily limit from settings and says when it resumes (FR-607)', async () => {
    await http()
      .put('/v1/admin/settings/tutor.dailyMessageLimit')
      .set(as(superAdmin))
      .send({ value: 2 })
      .expect(200);
    await send('Hallo').expect(200);
    const second = await send('Danke').expect(200);
    expect(second.body.remainingToday).toBe(0);
    const third = await send('Bitte').expect(429);
    expect(third.body.code).toBe('tutor_daily_limit');
    expect(new Date(third.body.resumesAt).getTime()).toBeGreaterThan(Date.now());
    expect(spy.reply).toHaveBeenCalledTimes(2);
    // Settings are cached in the process, so put the default back for the next test.
    await http()
      .put('/v1/admin/settings/tutor.dailyMessageLimit')
      .set(as(superAdmin))
      .send({ value: 30 })
      .expect(200);
  });

  it('does not use up the day when the tutor cannot answer', async () => {
    spy.reply.mockRejectedValueOnce(new Error('vendor down'));
    await send('Hallo').expect(500);
    expect((await send('Hallo').expect(200)).body.remainingToday).toBe(29);
  });

  it('closes while the tutor module is switched off (FR-1103)', async () => {
    await http()
      .put('/v1/admin/feature-flags/module.tutor')
      .set(as(superAdmin))
      .send({ enabled: false })
      .expect(200);
    const res = await send('Hallo').expect(403);
    expect(res.body.code).toBe('feature_disabled');
    await http()
      .put('/v1/admin/feature-flags/module.tutor')
      .set(as(superAdmin))
      .send({ enabled: true })
      .expect(200);
  });

  it('is for learners only', async () => {
    await send('Hallo', 'A1', reviewer).expect(403);
    await http().post('/v1/tutor/messages').send({ text: 'Hallo', level: 'A1' }).expect(401);
  });

  describe('flags (FR-608)', () => {
    async function flaggedReply() {
      const reply = (await send('Hallo').expect(200)).body;
      await http()
        .post(`/v1/tutor/messages/${reply.id}/flag`)
        .set(as(learner.token))
        .send({ reason: 'Wrong article' })
        .expect(204);
      return reply.id as string;
    }

    it('goes to a queue that shows the exchange but not who asked; a reviewer resolves it', async () => {
      const messageId = await flaggedReply();
      const queue = (await http().get('/v1/admin/tutor/flags').set(as(reviewer)).expect(200)).body;
      expect(queue).toEqual([
        expect.objectContaining({
          status: 'open',
          reason: 'Wrong article',
          level: 'A1',
          question: 'Hallo',
          answer: 'Sag <de>Guten Morgen!</de> am Morgen.',
        }),
      ]);
      const text = JSON.stringify(queue);
      for (const secret of [learner.id, 'Test-Ravi', '+9155', 'warangal'])
        expect(text).not.toContain(secret);

      await http()
        .post(`/v1/admin/tutor/flags/${queue[0].id}/resolve`)
        .set(as(reviewer))
        .send({ note: 'Fixed in the prompt' })
        .expect(204);
      expect(
        (await http().get('/v1/admin/tutor/flags').set(as(reviewer)).expect(200)).body,
      ).toEqual([]);
      const done = (
        await http().get('/v1/admin/tutor/flags?status=resolved').set(as(reviewer)).expect(200)
      ).body;
      expect(done[0]).toMatchObject({ status: 'resolved', note: 'Fixed in the prompt' });
      const audit = await prisma.db.auditLog.findFirst({ where: { entityId: queue[0].id } });
      expect(audit).toMatchObject({ outcome: 'success', actorRole: 'reviewer' });
      expect(audit?.action).toContain('resolve');
      const history = (await http().get('/v1/tutor/messages').set(as(learner.token)).expect(200))
        .body;
      expect(history.find((m: { id: string }) => m.id === messageId)).toMatchObject({
        flagged: true,
      });
    });

    it('is harmless to repeat, and only works on a reply the learner received', async () => {
      const id = await flaggedReply();
      await http()
        .post(`/v1/tutor/messages/${id}/flag`)
        .set(as(learner.token))
        .send({ reason: 'Again' })
        .expect(204);
      expect(await prisma.db.tutorFlag.count()).toBe(1);

      const own = (await http().get('/v1/tutor/messages').set(as(learner.token)).expect(200))
        .body[0];
      await http()
        .post(`/v1/tutor/messages/${own.id}/flag`)
        .set(as(learner.token))
        .send({ reason: 'x' })
        .expect(404);
      const other = await registerLearner(app, '+915599800102');
      await http()
        .post(`/v1/tutor/messages/${id}/flag`)
        .set(as(other.tokens.accessToken))
        .send({ reason: 'x' })
        .expect(404);
    });

    it('is closed to learners and open to reviewers and admins only', async () => {
      await http().get('/v1/admin/tutor/flags').set(as(learner.token)).expect(403);
      await http().get('/v1/admin/tutor/flags').set(as(superAdmin)).expect(200);
    });
  });

  it('deletes conversations after 90 days and keeps newer ones (NFR-15)', async () => {
    await send('Hallo').expect(200);
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    await prisma.db.tutorMessage.updateMany({ where: { role: 'user' }, data: { createdAt: old } });
    const { TutorService } = await import('../src/tutor/tutor.service.js');
    expect(await app.get(TutorService).purge()).toBe(1);
    const left = await prisma.db.tutorMessage.findMany();
    expect(left.map((m) => m.role)).toEqual(['assistant']);
  });

  it('includes the conversation in the data export and erases it with the account (FR-804)', async () => {
    await send('Hallo').expect(200);
    const exported = (await http().get('/v1/me/export').set(as(learner.token)).expect(200)).body;
    expect(exported.tutorConversations.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
    await http().post('/v1/me/erase').set(as(learner.token)).send({ confirm: true }).expect(204);
    expect(await prisma.db.tutorMessage.count({ where: { learnerId: learner.id } })).toBe(0);
  });
});
