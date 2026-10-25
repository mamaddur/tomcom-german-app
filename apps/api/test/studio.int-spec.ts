import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { createTestApp } from './app.factory.js';
import { completeLesson } from './content-fixtures.js';
import { createStaff, registerLearner, resetState, staffLogin } from './helpers.js';

const AUTHOR = '+915599100001';
const REVIEWER = '+915599100002';
const TRAINER = '+915599100003';

describe('content studio (FR-1001, FR-1003, FR-1005)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let author: string;
  let reviewer: string;
  let authorId: string;
  let reviewerId: string;
  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(phone: string) {
    const redis = await app.get(RedisService).connected();
    const keys = await redis.keys('otp-cooldown:*');
    if (keys.length) await redis.del(...keys);
    return staffLogin(app, phone);
  }

  async function newLesson() {
    const res = await http()
      .post('/v1/studio/lessons')
      .set(as(author))
      .send({ level: 'A1', title: { en: 'Greetings' } })
      .expect(201);
    return res.body as { id: string; revision: number; status: string; order: number };
  }

  async function saveComplete(id: string, expectedRevision: number) {
    return (
      await http()
        .put(`/v1/studio/lessons/${id}`)
        .set(as(author))
        .send(completeLesson(expectedRevision))
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
    await prisma.db.$executeRaw`TRUNCATE lessons, vocab_items CASCADE`;
    authorId = (await createStaff(app, 'author', AUTHOR)).id;
    reviewerId = (await createStaff(app, 'reviewer', REVIEWER)).id;
    author = (await login(AUTHOR)).tokens.accessToken;
    reviewer = (await login(REVIEWER)).tokens.accessToken;
  });

  it('lists the three levels', async () => {
    const levels = (await http().get('/v1/studio/levels').set(as(reviewer)).expect(200)).body;
    expect(levels.map((l: { code: string }) => l.code)).toEqual(['A1', 'A2', 'B1']);
  });

  it('creates a draft at the end of the level and saves whole lessons as new revisions', async () => {
    const first = await newLesson();
    const second = await newLesson();
    expect([first.order, second.order]).toEqual([1, 2]);
    expect(first).toMatchObject({ status: 'draft', revision: 1 });

    const saved = await saveComplete(first.id, 1);
    expect(saved).toMatchObject({ revision: 2, status: 'draft' });
    expect(saved.screens).toHaveLength(1);
    expect(saved.questions[0].prompt.te).toContain('Hallo');
  });

  it('rejects a save based on an old revision (no lost updates)', async () => {
    const lesson = await newLesson();
    await saveComplete(lesson.id, 1);
    const stale = await http()
      .put(`/v1/studio/lessons/${lesson.id}`)
      .set(as(author))
      .send(completeLesson(1));
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'revision_conflict', currentRevision: 2 });
  });

  it('will not send a lesson to review until every text is in Telugu and English', async () => {
    const lesson = await newLesson();
    const body = completeLesson(1);
    delete (body.description as { te?: string }).te;
    await http().put(`/v1/studio/lessons/${lesson.id}`).set(as(author)).send(body).expect(200);
    const res = await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(author))
      .send({ to: 'in_review' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('lesson_incomplete');
    expect(res.body.errors.join()).toMatch(/description/);
  });

  it('runs the review workflow: submit → locked → sent back with comment → resubmit → approve', async () => {
    const lesson = await newLesson();
    await saveComplete(lesson.id, 1);
    const submit = () =>
      http()
        .post(`/v1/studio/lessons/${lesson.id}/transition`)
        .set(as(author))
        .send({ to: 'in_review' });

    expect((await submit().expect(200)).body.status).toBe('in_review');
    const locked = await http()
      .put(`/v1/studio/lessons/${lesson.id}`)
      .set(as(author))
      .send(completeLesson(2));
    expect(locked.body.code).toBe('lesson_in_review');

    const noReason = await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(reviewer))
      .send({ to: 'draft' });
    expect(noReason.body.code).toBe('comment_required');
    const back = await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(reviewer))
      .send({ to: 'draft', comment: 'Please add a dialogue screen.' })
      .expect(200);
    expect(back.body.status).toBe('draft');
    expect(back.body.comments).toEqual([
      expect.objectContaining({ authorId: reviewerId, body: 'Please add a dialogue screen.' }),
    ]);

    await submit().expect(200);
    const approvedByAuthor = await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(author))
      .send({ to: 'approved' });
    expect(approvedByAuthor.status).toBe(403);
    const approved = await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(reviewer))
      .send({ to: 'approved' })
      .expect(200);
    expect(approved.body.status).toBe('approved');

    const toPublished = await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(reviewer))
      .send({ to: 'published' });
    expect(toPublished.body.code).toBe('validation_failed'); // publishing is a separate step (pack builder)
  });

  it('enforces four eyes: a reviewer cannot approve a revision they edited', async () => {
    const lesson = await newLesson();
    await saveComplete(lesson.id, 1);
    await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(author))
      .send({ to: 'in_review' })
      .expect(200);
    // The same person later becomes a reviewer (roles change over time).
    await prisma.db.user.update({ where: { id: authorId }, data: { role: 'reviewer' } });
    const promoted = (await login(AUTHOR)).tokens.accessToken;
    const res = await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(promoted))
      .send({ to: 'approved' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('four_eyes');
  });

  it('reopens an approved lesson as a draft when it is edited', async () => {
    const lesson = await newLesson();
    await saveComplete(lesson.id, 1);
    await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(author))
      .send({ to: 'in_review' })
      .expect(200);
    await http()
      .post(`/v1/studio/lessons/${lesson.id}/transition`)
      .set(as(reviewer))
      .send({ to: 'approved' })
      .expect(200);
    const edited = await saveComplete(lesson.id, 2);
    expect(edited).toMatchObject({ status: 'draft', revision: 3 });
  });

  it('keeps every revision and rolls back to an earlier one as a new draft (FR-1005)', async () => {
    const lesson = await newLesson();
    await saveComplete(lesson.id, 1);
    const changed = completeLesson(2);
    changed.title = { te: 'కుటుంబం', en: 'Family' };
    await http().put(`/v1/studio/lessons/${lesson.id}`).set(as(author)).send(changed).expect(200);

    const revisions = (
      await http().get(`/v1/studio/lessons/${lesson.id}/revisions`).set(as(reviewer)).expect(200)
    ).body;
    expect(revisions.map((r: { revision: number }) => r.revision)).toEqual([3, 2, 1]);

    const restored = await http()
      .post(`/v1/studio/lessons/${lesson.id}/rollback`)
      .set(as(author))
      .send({ revision: 2 })
      .expect(200);
    expect(restored.body).toMatchObject({
      revision: 4,
      status: 'draft',
      title: { en: 'Greetings' },
    });
  });

  it('never lets two lessons share a screen or question id (stable ids, ADR-008)', async () => {
    const a = await newLesson();
    const b = await newLesson();
    const body = completeLesson(1);
    await http().put(`/v1/studio/lessons/${a.id}`).set(as(author)).send(body).expect(200);
    const clash = await http().put(`/v1/studio/lessons/${b.id}`).set(as(author)).send(body);
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('id_in_use_elsewhere');
  });

  it('accepts a large lesson (60 questions with Telugu text)', async () => {
    const lesson = await newLesson();
    const body = completeLesson(1);
    const q = body.questions[0]!;
    body.questions = Array.from({ length: 60 }, () => ({
      ...q,
      id: crypto.randomUUID(),
      explanation: { te: 'వివరణ '.repeat(150), en: 'Explanation '.repeat(150) },
    }));
    expect(JSON.stringify(body).length).toBeGreaterThan(150_000);
    await http().put(`/v1/studio/lessons/${lesson.id}`).set(as(author)).send(body).expect(200);
  });

  it('manages shared vocabulary', async () => {
    const created = await http()
      .post('/v1/studio/vocab')
      .set(as(author))
      .send({
        german: 'Hammer',
        article: 'der',
        plural: 'Hämmer',
        meaning: { te: 'సుత్తి', en: 'hammer' },
        tradeTags: ['construction'],
      })
      .expect(201);
    const found = (await http().get('/v1/studio/vocab?q=hamm').set(as(reviewer)).expect(200)).body;
    expect(found).toEqual([
      expect.objectContaining({ id: created.body.id, german: 'Hammer', article: 'der' }),
    ]);
    const bad = await http()
      .post('/v1/studio/vocab')
      .set(as(author))
      .send({ german: 'X', meaning: { te: 1 }, tradeTags: [] });
    expect(bad.body.code).toBe('invalid_l10n');
  });

  it('keeps the studio to content roles, and writing to authors', async () => {
    const learner = (await registerLearner(app, '+915500000901')).tokens.accessToken;
    await createStaff(app, 'trainer', TRAINER);
    const trainer = (await login(TRAINER)).tokens.accessToken;
    await http().get('/v1/studio/lessons').set(as(learner)).expect(403);
    await http().get('/v1/studio/lessons').set(as(trainer)).expect(403);
    await http()
      .post('/v1/studio/lessons')
      .set(as(reviewer))
      .send({ level: 'A1', title: { en: 'x' } })
      .expect(403);
  });

  it('audits every studio change with the lesson id', async () => {
    const lesson = await newLesson();
    await saveComplete(lesson.id, 1);
    const entries = await prisma.db.auditLog.findMany({
      where: { actorId: authorId, entityId: lesson.id },
    });
    expect(entries.map((e) => `${e.action} ${e.outcome}`)).toContain(
      'PUT /v1/studio/lessons/:id success',
    );
  });
});
