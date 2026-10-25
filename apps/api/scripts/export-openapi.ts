// Writes the OpenAPI spec without a database: providers that touch the network are stubbed.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Placeholders so config validation passes; nothing connects to these.
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.REDIS_URL ??= 'redis://localhost:6379/0';
process.env.APP_ENV ??= 'test';
process.env.S3_BUCKET ??= 'openapi';
for (const k of ['PII_ENCRYPTION_KEY', 'PII_HMAC_KEY', 'JWT_SECRET']) {
  process.env[k] ??= Buffer.alloc(32).toString('base64');
}
process.env.LOG_LEVEL = 'silent';

async function run(): Promise<void> {
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { buildOpenApi, configureApp } = await import('../src/bootstrap.js');
  const { PrismaService } = await import('../src/infra/prisma.service.js');
  const { RedisService } = await import('../src/infra/redis.service.js');
  const { OBJECT_STORAGE } = await import('../src/adapters/storage/object-storage.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(RedisService)
    .useValue({})
    .overrideProvider(OBJECT_STORAGE)
    .useValue({})
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  const out = resolve(import.meta.dirname, '../openapi.json');
  writeFileSync(out, JSON.stringify(buildOpenApi(app), null, 2) + '\n');
  await app.close();
  console.log(`OpenAPI written to ${out}`);
}

void run();
