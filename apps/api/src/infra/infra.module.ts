import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from '../config/env';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }, PrismaService, RedisService],
  exports: [ENV, PrismaService, RedisService],
})
export class InfraModule {}
