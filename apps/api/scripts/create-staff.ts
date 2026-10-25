// Creates or updates a staff account (trainer, tomcom_admin, author, reviewer, super_admin).
// Used to bootstrap the first super admin; afterwards super admins manage staff in the portal (FR-908).
//
//   STAFF_PASSWORD='…' pnpm --filter @tomcom/api staff:create --role super_admin --phone +91… --first Name [--last Name]
//
// The password is read from STAFF_PASSWORD so it never appears in shell history or process lists.
import 'reflect-metadata';
import { parseArgs } from 'node:util';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Environment supplied directly.
}

const STAFF_ROLES = ['trainer', 'tomcom_admin', 'author', 'reviewer', 'super_admin'] as const;

async function run(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--')),
    options: {
      role: { type: 'string' },
      phone: { type: 'string' },
      first: { type: 'string' },
      last: { type: 'string' },
    },
  });
  const { loadEnv, isProduction } = await import('../src/config/env.js');
  const { normalizePhone, isSyntheticPhone } = await import('../src/common/phone.js');
  const { PiiCryptoService } = await import('../src/common/pii-crypto.service.js');
  const { PrismaService } = await import('../src/infra/prisma.service.js');
  const { hashPassword, passwordProblem } = await import('../src/identity/passwords.js');

  const env = loadEnv();
  const role = values.role as (typeof STAFF_ROLES)[number];
  if (!STAFF_ROLES.includes(role))
    throw new Error(`--role must be one of ${STAFF_ROLES.join(', ')}`);
  const e164 = normalizePhone(values.phone ?? '');
  if (!e164 || (isSyntheticPhone(e164) && isProduction(env)))
    throw new Error('--phone is not a valid mobile number');
  if (!values.first) throw new Error('--first is required');
  const password = process.env.STAFF_PASSWORD ?? '';
  const problem = passwordProblem(password);
  if (problem) throw new Error(`STAFF_PASSWORD: ${problem}`);

  const crypto = new PiiCryptoService(env);
  const prisma = new PrismaService(env);
  const phoneHmac = crypto.hmac(e164);
  const existing = await prisma.db.user.findUnique({ where: { phoneHmac } });
  if (existing?.role === 'learner') throw new Error('this number belongs to a learner account');
  const user = await prisma.db.user.upsert({
    where: { phoneHmac },
    create: {
      role,
      phoneHmac,
      phoneEnc: new Uint8Array(crypto.encrypt(e164)),
      firstName: values.first,
      lastName: values.last ?? null,
      uiLocale: 'en',
    },
    update: { role, firstName: values.first, lastName: values.last ?? null },
  });
  const passwordHash = await hashPassword(password);
  await prisma.db.staffCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, passwordHash },
    update: { passwordHash, failedAttempts: 0, lockedUntil: null, passwordChangedAt: new Date() },
  });
  await prisma.db.auditLog.create({
    data: {
      action: 'staff_account_upsert_cli',
      entityType: 'user',
      entityId: user.id,
      outcome: 'success',
      details: { role },
    },
  });
  await prisma.onModuleDestroy();
  console.log(`Staff account ready: ${role} ${user.id}`);
}

run().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
