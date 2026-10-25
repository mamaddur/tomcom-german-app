import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FeatureGuard } from './feature.guard.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService, { provide: APP_GUARD, useClass: FeatureGuard }],
  exports: [SettingsService],
})
export class SettingsModule {}
