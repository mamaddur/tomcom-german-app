import { Module } from '@nestjs/common';
import { PrivacyController } from './privacy.controller.js';
import { PrivacyService } from './privacy.service.js';

/** Data rights under the DPDP Act 2023: export and erasure (FR-804). */
@Module({ controllers: [PrivacyController], providers: [PrivacyService] })
export class PrivacyModule {}
