import { Module } from '@nestjs/common';
import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** Admin portal API (FR-901–FR-909). Every query is scoped by `batchScope` (FR-908). */
@Module({
  controllers: [BatchesController, ReportsController],
  providers: [BatchesService, ReportsService],
  exports: [ReportsService],
})
export class AdminModule {}
