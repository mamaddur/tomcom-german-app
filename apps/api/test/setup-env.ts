// Runs before any test module is imported. Synthetic, local-only services.
process.env.DATABASE_URL ??= 'postgresql://tomcom:tomcom@localhost:5432/tomcom_test';
process.env.REDIS_URL ??= 'redis://localhost:6379/15';
process.env.APP_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'silent';
