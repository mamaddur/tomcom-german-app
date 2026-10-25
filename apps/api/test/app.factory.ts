import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OBJECT_STORAGE } from '../src/adapters/storage/object-storage.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';

export interface Overrides {
  prisma?: unknown;
  redis?: unknown;
  storage?: unknown;
  /** Test-only controllers, e.g. a protected route for guard tests. */
  controllers?: Type<unknown>[];
}

export async function createTestApp(overrides: Overrides = {}): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: overrides.controllers ?? [],
  });
  if (overrides.prisma)
    builder = builder.overrideProvider(PrismaService).useValue(overrides.prisma);
  if (overrides.redis) builder = builder.overrideProvider(RedisService).useValue(overrides.redis);
  if (overrides.storage)
    builder = builder.overrideProvider(OBJECT_STORAGE).useValue(overrides.storage);
  const app = (await builder.compile()).createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
