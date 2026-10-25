import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

/** Learner progress on the server: quiz attempts, lesson results, daily activity. */
@Module({ controllers: [SyncController], providers: [SyncService], exports: [SyncService] })
export class LearningModule {}
