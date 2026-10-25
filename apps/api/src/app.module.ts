import { Module } from '@nestjs/common';
import { SmsModule } from './adapters/sms/sms.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { InfraModule } from './infra/infra.module.js';
import { createLoggerModule } from './logging/logger.module.js';

@Module({
  imports: [
    createLoggerModule(),
    InfraModule,
    CommonModule,
    SmsModule,
    HealthModule,
    IdentityModule,
  ],
})
export class AppModule {}
