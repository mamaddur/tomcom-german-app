import { Module } from '@nestjs/common';
import { StudioController } from './studio.controller.js';
import { StudioService } from './studio.service.js';
import { VocabService } from './vocab.service.js';

@Module({
  controllers: [StudioController],
  providers: [StudioService, VocabService],
  exports: [StudioService],
})
export class ContentModule {}
