import { Module } from '@nestjs/common';
import {
  AdminCertificatesController,
  MyCertificatesController,
  VerifyController,
} from './certificates.controller.js';
import { CertificatesService } from './certificates.service.js';

/** Level certificates (FR-701–FR-705). */
@Module({
  controllers: [MyCertificatesController, VerifyController, AdminCertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
