// Adds synthetic learners with believable progress so the admin portal has something to show:
// quiz attempts, learning time, streaks, checkpoints waiting for a trainer, certificates, a batch
// announcement, and one flagged tutor answer. Run after `seed:demo` (needs its published A1 course).
// Synthetic +9155… numbers only, names start with "Test-". Safe to run again: learners that exist
// are skipped. Dev and test databases only.
// Usage: pnpm --filter @tomcom/seed -s generate --learners 40 | pnpm --filter @tomcom/api -s seed:demo-learners
import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Prisma } from '../src/generated/prisma/client.js';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI/containers pass the environment directly.
}

interface Dataset {
  learners: Array<{
    phone: string;
    firstName: string;
    lastName: string;
    district: string;
    trade: string;
    selfDeclaredLevel: 'none' | 'A1' | 'A2';
    uiLocale: 'te' | 'en';
    batchCode: string;
  }>;
}

/** Same alphabet as certificate codes (certificates.service.ts). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const newCode = () =>
  `TC-${Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

/** mulberry32: small deterministic PRNG, so the demo looks the same every time. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;
const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function run(): Promise<void> {
  const { loadEnv } = await import('../src/config/env.js');
  const { PiiCryptoService } = await import('../src/common/pii-crypto.service.js');
  const { PrismaService } = await import('../src/infra/prisma.service.js');
  const env = loadEnv();
  if (env.APP_ENV === 'prod' || env.APP_ENV === 'staging') {
    throw new Error('seed-demo-learners only runs against dev/test databases');
  }
  const data = JSON.parse(readFileSync(0, 'utf8')) as Dataset;
  const crypto = new PiiCryptoService(env);
  const prisma = new PrismaService(env);
  const db = prisma.db;
  const rand = prng(2026);
  const now = new Date();

  const level = await db.level.findUniqueOrThrow({ where: { code: 'A1' } });
  const lessons = await db.lesson.findMany({
    where: { levelId: level.id, status: 'published' },
    orderBy: { order: 'asc' },
    include: { questions: true },
  });
  if (lessons.length === 0) throw new Error('No published A1 lessons: run `pnpm seed:demo` first.');
  const pack = await db.packVersion.findFirstOrThrow({
    where: { levelId: level.id },
    orderBy: { version: 'desc' },
  });
  const checkpoint = await db.checkpoint.findUnique({ where: { levelId: level.id } });
  const cpContent = (checkpoint?.publishedContent ?? null) as {
    sections: { reading: unknown[]; listening: unknown[]; writing: Array<{ id: string }> };
  } | null;
  const batches = new Map((await db.batch.findMany()).map((b) => [b.code, b]));
  const trainer = await db.user.findFirstOrThrow({ where: { role: 'trainer' } });
  const superAdmin = await db.user.findFirstOrThrow({ where: { role: 'super_admin' } });

  // Where each learner ends up (shares add to 1).
  const stage = (r: number) =>
    r < 0.12
      ? 'none'
      : r < 0.34
        ? 'one'
        : r < 0.62
          ? 'some'
          : r < 0.8
            ? 'all'
            : r < 0.88
              ? 'waiting'
              : 'certified';

  let created = 0;
  const made: Array<{ id: string; firstName: string; stage: string }> = [];
  for (const l of data.learners) {
    if (!l.phone.startsWith('+9155')) throw new Error('seed data must use synthetic +9155 numbers');
    const phoneHmac = crypto.hmac(l.phone);
    if (await db.user.findUnique({ where: { phoneHmac } })) continue;
    const batch = batches.get(l.batchCode);
    const st = stage(rand());
    const user = await db.user.create({
      data: {
        role: 'learner',
        phoneHmac,
        phoneEnc: new Uint8Array(crypto.encrypt(l.phone)),
        firstName: l.firstName,
        lastName: l.lastName,
        uiLocale: l.uiLocale,
        profile: {
          create: {
            districtCode: l.district,
            tradeCode: l.trade,
            selfDeclaredLevel: l.selfDeclaredLevel,
          },
        },
        consents: {
          create: {
            noticeVersion: 1,
            purposes: ['learning', 'progress_sharing'],
            locale: l.uiLocale,
            grantedAt: new Date(now.getTime() - (20 + Math.floor(rand() * 20)) * DAY),
          },
        },
        ...(batch
          ? {
              enrolments: {
                create: {
                  batchId: batch.id,
                  source: rand() < 0.5 ? 'code' : 'bulk',
                  enrolledAt: new Date(now.getTime() - (25 + Math.floor(rand() * 15)) * DAY),
                },
              },
            }
          : {}),
      },
    });
    made.push({ id: user.id, firstName: l.firstName, stage: st });
    created++;

    const passedCount =
      st === 'none'
        ? 0
        : st === 'one'
          ? 1
          : st === 'some'
            ? 2 + Math.floor(rand() * 3)
            : lessons.length;
    // Lessons are passed in order over the last five weeks, ending a few days ago (or today).
    const lastActiveDaysAgo = st === 'none' ? 99 : Math.floor(rand() * 9);
    const span = Math.max(passedCount, 1) * 4;
    let finishedAt = lastActiveDaysAgo + span;
    let latest = new Date(0);
    for (const lesson of lessons.slice(0, passedCount)) {
      const tries = 1 + Math.floor(rand() * 3);
      let best = 0;
      let passedAt = now;
      for (let k = 0; k < tries; k++) {
        const pass = k === tries - 1;
        const score = pass ? 0.8 + Math.floor(rand() * 3) * 0.1 : 0.4 + rand() * 0.35;
        const when = new Date(now.getTime() - (finishedAt - k * 0.5) * DAY);
        const correct = Math.round(score * lesson.questions.length);
        await db.quizAttempt.create({
          data: {
            clientId: randomUUID(),
            learnerId: user.id,
            lessonId: lesson.id,
            packVersion: pack.version,
            score: Math.min(1, correct / lesson.questions.length),
            passed: pass,
            durationMs: 90_000 + Math.floor(rand() * 210_000),
            answers: lesson.questions.map((q, i) => ({
              questionId: q.id,
              response: i < correct ? q.answer : null,
              correct: i < correct,
            })),
            finishedAt: when,
          },
        });
        best = Math.max(best, correct / lesson.questions.length);
        passedAt = when;
        if (when > latest) latest = when;
      }
      await db.lessonProgress.create({
        data: {
          learnerId: user.id,
          lessonId: lesson.id,
          bestScore: Math.min(1, best),
          passed: true,
          passedAt,
        },
      });
      finishedAt -= 4;
    }

    // Learning time: a run of days ending at the last active day, plus scattered earlier days.
    if (st !== 'none') {
      const days = new Set<number>();
      const run = 2 + Math.floor(rand() * 8);
      for (let d = 0; d < run; d++) days.add(lastActiveDaysAgo + d);
      for (let d = 0; d < 6 + Math.floor(rand() * 10); d++)
        days.add(lastActiveDaysAgo + run + 1 + Math.floor(rand() * 28));
      await db.dailyActivity.createMany({
        data: [...days].map((d) => ({
          learnerId: user.id,
          date: new Date(`${istDay(new Date(now.getTime() - d * DAY))}T00:00:00Z`),
          seconds: 300 + Math.floor(rand() * 1500),
        })),
        skipDuplicates: true,
      });
      await db.user.update({
        where: { id: user.id },
        data: { lastSeenAt: new Date(now.getTime() - lastActiveDaysAgo * DAY) },
      });
    }

    // Level checkpoint (FR-404): waiting for a trainer, or passed with a certificate (FR-701).
    if ((st === 'waiting' || st === 'certified') && checkpoint && cpContent) {
      const writing = cpContent.sections.writing[0]!;
      const startedAt = new Date(latest.getTime() + DAY);
      const writingText =
        'Guten Morgen! Ich heiße ' +
        l.firstName.replace('Test-', '') +
        '. Ich komme aus Indien und ich bin ' +
        (l.trade === 'electrician' ? 'Elektriker' : 'Arbeiter') +
        '. Danke und bis bald!';
      const base = {
        learnerId: user.id,
        levelId: level.id,
        checkpointRevision: checkpoint.publishedRevision ?? checkpoint.revision,
        passMark: 0.6,
        items: {
          reading: cpContent.sections.reading.slice(0, 4),
          listening: cpContent.sections.listening.slice(0, 3),
          writing: [writing],
        } as unknown as Prisma.InputJsonValue,
        responses: { answers: {}, writing: { [writing.id]: writingText } },
        startedAt,
        expiresAt: new Date(startedAt.getTime() + 90 * 60 * 1000),
        submittedAt: new Date(startedAt.getTime() + 40 * 60 * 1000),
      };
      if (st === 'waiting') {
        await db.checkpointAttempt.create({
          data: {
            ...base,
            status: 'awaiting_marking',
            sectionScores: { reading: 0.75, listening: 0.67 },
          },
        });
      } else {
        const writingScore = 0.7 + rand() * 0.25;
        const reading = 0.75 + rand() * 0.25;
        const listening = 0.67 + rand() * 0.33;
        const total = (reading + listening + writingScore) / 3;
        const attempt = await db.checkpointAttempt.create({
          data: {
            ...base,
            status: 'passed',
            sectionScores: { reading, listening, writing: writingScore },
            writingMarks: {
              [writing.id]: { score: writingScore, comment: 'Gut gemacht. Good work.' },
            },
            total,
            markedBy: trainer.id,
            markedAt: new Date(startedAt.getTime() + DAY),
          },
        });
        await db.certificate.create({
          data: {
            code: newCode(),
            learnerId: user.id,
            levelId: level.id,
            attemptId: attempt.id,
            holderName: `${l.firstName} ${l.lastName}`,
            score: total,
            issuedAt: new Date(startedAt.getTime() + DAY),
          },
        });
      }
    }
  }

  // A batch announcement (FR-205, FR-906).
  const first = batches.get('TST-001');
  if (first) {
    await db.announcement.upsert({
      where: { id: '00000000-0000-7000-8000-000000000301' },
      create: {
        id: '00000000-0000-7000-8000-000000000301',
        title: { te: 'ఈ శనివారం మాక్ ఇంటర్వ్యూ', en: 'Mock interview this Saturday' },
        body: {
          te: 'ఉదయం 10 గంటలకు తరగతి గదిలో. మీ పరిచయం జర్మన్‌లో సిద్ధం చేసుకోండి.',
          en: '10 am in the classroom. Prepare your introduction in German.',
        },
        batchId: first.id,
        createdBy: superAdmin.id,
      },
      update: {},
    });
  }

  // One flagged tutor answer for the reviewers' queue (FR-608).
  const flagged = made.find((m) => m.stage !== 'none');
  if (flagged && (await db.tutorFlag.count()) === 0) {
    const at = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    await db.tutorMessage.create({
      data: {
        learnerId: flagged.id,
        role: 'user',
        content: 'Ist es der Kabel oder das Kabel?',
        level: 'A1',
        createdAt: at,
      },
    });
    const answer = await db.tutorMessage.create({
      data: {
        learnerId: flagged.id,
        role: 'assistant',
        content: 'Es heißt <de>der Kabel</de>.',
        level: 'A1',
        createdAt: new Date(at.getTime() + 2000),
      },
    });
    await db.tutorFlag.create({
      data: {
        messageId: answer.id,
        learnerId: flagged.id,
        reason: 'German is wrong',
      },
    });
  }

  await prisma.onModuleDestroy();
  console.log(
    `Added ${created} synthetic learners (${data.learners.length - created} already existed) ` +
      'with progress, checkpoints and certificates. Synthetic data only.',
  );
}

run().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
