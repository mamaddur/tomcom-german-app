import { Module } from '@nestjs/common';
import { CheckpointsController } from './checkpoints.controller.js';
import { CheckpointsService } from './checkpoints.service.js';
import { PackService } from './pack.service.js';
import { PacksController } from './packs.controller.js';
import { StudioController } from './studio.controller.js';
import { StudioService } from './studio.service.js';
import { VocabService } from './vocab.service.js';

@Module({
  controllers: [StudioController, PacksController, CheckpointsController],
  providers: [StudioService, VocabService, PackService, CheckpointsService],
  exports: [StudioService, PackService, CheckpointsService],
})
export class ContentModule {}
