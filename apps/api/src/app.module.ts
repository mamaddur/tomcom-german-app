import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { InfraModule } from './infra/infra.module.js';
import { createLoggerModule } from './logging/logger.module.js';

@Module({
  imports: [createLoggerModule(), InfraModule, HealthModule],
})
export class AppModule {}
