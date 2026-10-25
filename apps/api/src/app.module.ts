import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { InfraModule } from './infra/infra.module';
import { createLoggerModule } from './logging/logger.module';

@Module({
  imports: [createLoggerModule(), InfraModule, HealthModule],
})
export class AppModule {}
