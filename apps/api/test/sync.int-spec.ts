import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { createTestApp } from './app.factory.js';
import { createStaff, registerLearner, resetState } from './helpers.js';

describe('offline sync of quiz attempts and learning time (FR-405, FR-204, NFR-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let learnerId: string;
  let lessonId: string;
  const http = () => request(app.getHttpServer());
  const sync = (body: object, t = token) =>
    http().post('/v1/sync').set('Authorization', `Bearer ${t}`).send(body);

  const attempt = (over: Partial<Record<string, unknown>> = {}) => ({
    id: randomUUID(),
    lessonId,
    packVersion: 1,
    score: 0.6,
    passed: false,
    durationMs: 95_000,
    answers: [{ questionId: 'q1', response: 0, correct: true }],
    finishedAt: new Date().toISOString(),
    ...over,
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetState(app);
    const author = await createStaff(app, 'author', '+915599600001');
    const level = await prisma.db.level.findFirstOrThrow({ where: { code: 'A1' } });
    lessonId = (
      await prisma.db.lesson.create({
        data: {
          levelId: level.id,
          order: 1,
          title: { te: 'పాఠం', en: 'Lesson' },
          description: { te: '', en: '' },
          estMinutes: 10,
          createdBy: author.id,
          updatedBy: author.id,
        },
      })
    ).id;
    const learner = await registerLearner(app, '+915599600101');
    token = learner.tokens.accessToken;
    learnerId = learner.user.id;
  });

  it('stores attempts and keeps the best score; a pass is never undone', async () => {
    const fail = attempt();
    const pass = attempt({ score: 0.9, passed: true });
    const worse = attempt({ score: 0.4 });
    const res = await sync({ attempts: [fail, pass], activity: [] }).expect(200);
    expect(res.body.stored).toEqual([fail.id, pass.id]);
    expect(res.body.lessons).toEqual([{ lessonId, bestScore: 0.9, passed: true }]);

    const later = await sync({ attempts: [worse], activity: [] }).expect(200);
    expect(later.body.lessons).toEqual([{ lessonId, bestScore: 0.9, passed: true }]);
    expect(await prisma.db.quizAttempt.count({ where: { learnerId } })).toBe(3);
  });

  it('ignores a resent attempt (client UUID), so the outbox can retry safely', async () => {
    const a = attempt({ score: 0.85, passed: true });
    await sync({ attempts: [a], activity: [] }).expect(200);
    const again = await sync({ attempts: [a], activity: [] }).expect(200);
    expect(again.body.stored).toEqual([a.id]);
    expect(await prisma.db.quizAttempt.count({ where: { learnerId } })).toBe(1);
  });

  it('does not believe a "pass" below the lowest possible pass mark', async () => {
    const res = await sync({ attempts: [attempt({ score: 0.3, passed: true })], activity: [] });
    expect(res.body.lessons[0]).toMatchObject({ passed: false });
  });

  it('keeps the larger daily learning time and returns the last 60 days', async () => {
    const day = (offsetDays: number) =>
      new Date(Date.now() + 5.5 * 3600_000 - offsetDays * 86_400_000).toISOString().slice(0, 10);
    await sync({ attempts: [], activity: [{ date: day(0), seconds: 600 }] }).expect(200);
    const res = await sync({
      attempts: [],
      activity: [
        { date: day(0), seconds: 300 }, // an older phone with less time today
        { date: day(1), seconds: 900 },
        { date: day(400), seconds: 900 }, // too old: ignored
      ],
    }).expect(200);
    expect(res.body.activity).toEqual([
      { date: day(1), seconds: 900 },
      { date: day(0), seconds: 600 },
    ]);
  });

  it('a second phone gets the results (multi-device, FR-107)', async () => {
    await sync({ attempts: [attempt({ score: 1, passed: true })], activity: [] }).expect(200);
    const res = await sync({ attempts: [], activity: [] }).expect(200);
    expect(res.body.lessons).toEqual([{ lessonId, bestScore: 1, passed: true }]);
  });

  it('drops attempts for unknown lessons but reports them stored, so the outbox clears', async () => {
    const ghost = attempt({ lessonId: randomUUID() });
    const res = await sync({ attempts: [ghost], activity: [] }).expect(200);
    expect(res.body.stored).toEqual([ghost.id]);
    expect(await prisma.db.quizAttempt.count()).toBe(0);
  });

  it('rejects malformed input', async () => {
    await sync({ attempts: [attempt({ score: 1.5 })], activity: [] }).expect(400);
    await sync({ attempts: [attempt({ id: 'not-a-uuid' })], activity: [] }).expect(400);
    await sync({
      attempts: [attempt({ finishedAt: new Date(Date.now() + 3 * 86_400_000).toISOString() })],
      activity: [],
    }).expect(400);
    await sync({ attempts: [], activity: [{ date: '2026-10-25', seconds: 90_000 }] }).expect(400);
  });

  it('needs a learner session', async () => {
    await http().post('/v1/sync').send({ attempts: [], activity: [] }).expect(401);
  });

  it('syncs the word list: newest change wins, removals reach other phones (FR-308)', async () => {
    const author = await prisma.db.user.findFirstOrThrow({ where: { role: 'author' } });
    const vocab = await prisma.db.vocabItem.create({
      data: {
        german: 'Hammer',
        meaning: { te: 'సుత్తి', en: 'hammer' },
        tradeTags: [],
        createdBy: author.id,
        updatedBy: author.id,
      },
    });
    const word = (box: number, updatedAt: string, removed = false) => ({
      vocabId: vocab.id,
      box,
      due: '2026-10-27',
      removed,
      updatedAt,
    });
    await sync({ attempts: [], activity: [], words: [word(2, '2026-10-25T10:00:00Z')] }).expect(
      200,
    );
    // An older change from another phone does not overwrite the newer one.
    const stale = await sync({
      attempts: [],
      activity: [],
      words: [word(0, '2026-10-25T09:00:00Z')],
    }).expect(200);
    expect(stale.body.words).toEqual([
      expect.objectContaining({ vocabId: vocab.id, box: 2, removed: false }),
    ]);
    const removed = await sync({
      attempts: [],
      activity: [],
      words: [word(2, '2026-10-25T11:00:00Z', true)],
    }).expect(200);
    expect(removed.body.words).toEqual([expect.objectContaining({ removed: true })]);
    // Unknown words are ignored; requests without `words` still work.
    await sync({
      attempts: [],
      activity: [],
      words: [{ ...word(1, '2026-10-25T12:00:00Z'), vocabId: randomUUID() }],
    }).expect(200);
    await sync({ attempts: [], activity: [], words: [word(9, '2026-10-25T12:00:00Z')] }).expect(
      400,
    );
  });
});
