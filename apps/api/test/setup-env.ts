// Runs before any test module is imported. Synthetic, local-only services.
// The keys below are test-only constants (all zeros/ones) and protect nothing real.
process.env.DATABASE_URL ??= 'postgresql://tomcom:tomcom@localhost:5432/tomcom_test';
process.env.REDIS_URL ??= 'redis://localhost:6379/15';
process.env.APP_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.PII_ENCRYPTION_KEY ??= Buffer.alloc(32, 0).toString('base64');
process.env.PII_HMAC_KEY ??= Buffer.alloc(32, 1).toString('base64');
process.env.JWT_SECRET ??= Buffer.alloc(32, 2).toString('base64');
