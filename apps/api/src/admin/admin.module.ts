import { Module } from '@nestjs/common';
import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';

/** Admin portal API (FR-901–FR-909). Every query is scoped by `batchScope` (FR-908). */
@Module({ controllers: [BatchesController], providers: [BatchesService] })
export class AdminModule {}
