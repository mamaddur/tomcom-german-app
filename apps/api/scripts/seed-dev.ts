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
  const env = loadEnv();
  if (env.APP_ENV === 'prod' || env.APP_ENV === 'staging') {
    throw new Error('seed-dev only runs against dev/test databases');
  }
  const data = JSON.parse(readFileSync(0, 'utf8')) as Dataset;
  const crypto = new PiiCryptoService(env);
  const prisma = new PrismaService(env);
  const trainerIds = new Map<string, string>();

  for (const t of data.trainers) {
    if (!t.phone.startsWith('+9155')) throw new Error('seed data must use synthetic +9155 numbers');
    const phoneHmac = crypto.hmac(t.phone);
    const user = await prisma.db.user.upsert({
      where: { phoneHmac },
      create: {
        role: 'trainer',
        phoneHmac,
        phoneEnc: new Uint8Array(crypto.encrypt(t.phone)),
        firstName: t.firstName,
        lastName: t.lastName,
        uiLocale: 'en',
      },
      update: {},
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
  await prisma.onModuleDestroy();
  console.log(
    `Seeded ${data.trainers.length} trainers and ${data.batches.length} batches (synthetic)`,
  );
}

void run();
