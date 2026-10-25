import { Module } from '@nestjs/common';
import { SmsModule } from './adapters/sms/sms.module.js';
import { StorageModule } from './adapters/storage/storage.module.js';
import { AuditModule } from './audit/audit.module.js';
import { CommonModule } from './common/common.module.js';
import { ContentModule } from './content/content.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { InfraModule } from './infra/infra.module.js';
import { LearnersModule } from './learners/learners.module.js';
import { LearningModule } from './learning/learning.module.js';
import { createLoggerModule } from './logging/logger.module.js';
import { MediaModule } from './media/media.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrivacyModule } from './privacy/privacy.module.js';
import { ReferenceModule } from './reference/reference.module.js';
import { SettingsModule } from './settings/settings.module.js';

@Module({
  imports: [
    createLoggerModule(),
    InfraModule,
    CommonModule,
    SmsModule,
    StorageModule,
    AuditModule,
    SettingsModule,
    HealthModule,
    IdentityModule,
    ReferenceModule,
    LearnersModule,
    LearningModule,
    ContentModule,
    MediaModule,
    NotificationsModule,
    PrivacyModule,
  ],
})
export class AppModule {}
