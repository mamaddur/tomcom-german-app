import { Module } from '@nestjs/common';
import { AdminTutorController, TutorController } from './tutor.controller.js';
import { TutorRetentionService } from './tutor-retention.service.js';
import { TutorService } from './tutor.service.js';

/** AI tutor (FR-601–608): chat, safety filters, daily limit, flags, 90-day retention (NFR-15). */
@Module({
  controllers: [TutorController, AdminTutorController],
  providers: [TutorService, TutorRetentionService],
  exports: [TutorService],
})
export class TutorModule {}
