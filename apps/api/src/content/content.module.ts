import { Module } from '@nestjs/common';
import { PackService } from './pack.service.js';
import { PacksController } from './packs.controller.js';
import { StudioController } from './studio.controller.js';
import { StudioService } from './studio.service.js';
import { VocabService } from './vocab.service.js';

@Module({
  controllers: [StudioController, PacksController],
  providers: [StudioService, VocabService, PackService],
  exports: [StudioService, PackService],
})
export class ContentModule {}
