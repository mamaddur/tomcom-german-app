import { Module } from '@nestjs/common';
import { SmsModule } from './adapters/sms/sms.module.js';
import { AuditModule } from './audit/audit.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { InfraModule } from './infra/infra.module.js';
import { LearnersModule } from './learners/learners.module.js';
import { createLoggerModule } from './logging/logger.module.js';
import { ReferenceModule } from './reference/reference.module.js';

@Module({
  imports: [
    createLoggerModule(),
    InfraModule,
    CommonModule,
    SmsModule,
    AuditModule,
    HealthModule,
    IdentityModule,
    ReferenceModule,
    LearnersModule,
  ],
})
export class AppModule {}
