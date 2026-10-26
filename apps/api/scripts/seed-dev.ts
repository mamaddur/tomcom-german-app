// Loads synthetic trainers and batches from tools/seed into the dev database (idempotent).
// Usage: pnpm --filter @tomcom/seed -s generate | pnpm --filter @tomcom/api -s seed:dev
import 'reflect-metadata';
import { readFileSync } from 'node:fs';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI/containers pass the environment directly.
}

interface Dataset {
  trainers: Array<{ key: string; phone: string; firstName: string; lastName: string }>;
  batches: Array<{
    code: string;
    name: string;
    district: string;
    trade: string;
    trainerKey: string;
  }>;
}

async function run(): Promise<void> {
  const { loadEnv } = await import('../src/config/env.js');
  const { PiiCryptoService } = await import('../src/common/pii-crypto.service.js');
  const { PrismaService } = await import('../src/infra/prisma.service.js');
  const { hashPassword } = await import('../src/identity/passwords.js');
  const env = loadEnv();
  if (env.APP_ENV === 'prod' || env.APP_ENV === 'staging') {
    throw new Error('seed-dev only runs against dev/test databases');
  }
  const data = JSON.parse(readFileSync(0, 'utf8')) as Dataset;
  // Every synthetic staff account shares DEV_STAFF_PASSWORD from .env.local (random per machine).
  const devPassword = process.env.DEV_STAFF_PASSWORD;
  if (!devPassword) throw new Error('DEV_STAFF_PASSWORD missing in .env.local');
  const passwordHash = await hashPassword(devPassword);
  const crypto = new PiiCryptoService(env);
  const prisma = new PrismaService(env);
  const trainerIds = new Map<string, string>();

  const staff = [
    ...data.trainers.map((t) => ({ ...t, role: 'trainer' as const })),
    {
      key: 'super-admin',
      phone: '+915599990001',
      firstName: 'Test-Super',
      lastName: 'Admin',
      role: 'super_admin' as const,
    },
    {
      key: 'tomcom-admin',
      phone: '+915599990002',
      firstName: 'Test-Tomcom',
      lastName: 'Admin',
      role: 'tomcom_admin' as const,
    },
    {
      key: 'author',
      phone: '+915599990003',
      firstName: 'Test-Author',
      lastName: 'Content',
      role: 'author' as const,
    },
    {
      key: 'reviewer',
      phone: '+915599990004',
      firstName: 'Test-Reviewer',
      lastName: 'Content',
      role: 'reviewer' as const,
    },
  ];
  for (const t of staff) {
    if (!t.phone.startsWith('+9155')) throw new Error('seed data must use synthetic +9155 numbers');
    const phoneHmac = crypto.hmac(t.phone);
    const user = await prisma.db.user.upsert({
      where: { phoneHmac },
      create: {
        role: t.role,
        phoneHmac,
        phoneEnc: new Uint8Array(crypto.encrypt(t.phone)),
        firstName: t.firstName,
        lastName: t.lastName,
        uiLocale: 'en',
      },
      update: {},
    });
    await prisma.db.staffCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, passwordHash },
      // Re-seeding also clears lockouts left by earlier test runs.
      update: { passwordHash, failedAttempts: 0, lockedUntil: null },
    });
    trainerIds.set(t.key, user.id);
  }
  for (const b of data.batches) {
    const batch = await prisma.db.batch.upsert({
      where: { code: b.code },
      create: { code: b.code, name: b.name, districtCode: b.district, tradeCode: b.trade },
      update: {},
    });
    const trainerId = trainerIds.get(b.trainerKey);
    if (trainerId) {
      await prisma.db.batchTrainer.upsert({
        where: { batchId_trainerId: { batchId: batch.id, trainerId } },
        create: { batchId: batch.id, trainerId },
        update: {},
      });
    }
  }
  // One synthetic announcement for everyone, so the app's banner shows in dev (FR-205).
  const welcome = '00000000-0000-7000-8000-000000000205';
  await prisma.db.announcement.upsert({
    where: { id: welcome },
    create: {
      id: welcome,
      title: { te: 'స్వాగతం!', en: 'Welcome!' },
      body: {
        te: 'ప్రతిరోజూ 10 నిమిషాలు నేర్చుకోండి. (పరీక్ష ప్రకటన)',
        en: 'Learn for 10 minutes every day. (Test announcement)',
      },
      createdBy: trainerIds.get('super-admin')!,
    },
    update: {},
  });
  await prisma.onModuleDestroy();
  console.log(
    `Seeded ${data.trainers.length} trainers, admins (super +915599990001, TOMCOM +915599990002), ` +
      `author +915599990003, reviewer +915599990004 and ` +
      `${data.batches.length} batches. Staff password: DEV_STAFF_PASSWORD in apps/api/.env.local; OTP ${env.DEV_OTP}`,
  );
}

void run();
