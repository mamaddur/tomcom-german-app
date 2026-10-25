import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from '../config/env.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }, PrismaService, RedisService],
  exports: [ENV, PrismaService, RedisService],
})
export class InfraModule {}
