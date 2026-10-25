import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';

export interface Overrides {
  prisma?: unknown;
  redis?: unknown;
}

export async function createTestApp(overrides: Overrides = {}): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (overrides.prisma)
    builder = builder.overrideProvider(PrismaService).useValue(overrides.prisma);
  if (overrides.redis) builder = builder.overrideProvider(RedisService).useValue(overrides.redis);
  const app = (await builder.compile()).createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
