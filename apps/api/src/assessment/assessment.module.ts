import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { LearnerCheckpointsController, MarkingController } from './assessment.controller.js';
import { CheckpointAttemptsService } from './checkpoint-attempts.service.js';

/** Level checkpoints: attempts, server scoring and trainer marking (FR-404, ADR-009). */
@Module({
  imports: [MediaModule],
  controllers: [LearnerCheckpointsController, MarkingController],
  providers: [CheckpointAttemptsService],
  exports: [CheckpointAttemptsService],
})
export class AssessmentModule {}
