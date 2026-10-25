import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../common/api-error.js';
import type { FeatureKey } from './registry.js';
import { SettingsService } from './settings.service.js';

const FEATURE = 'feature';
/** Closes a route (or controller) while its module is switched off (FR-1103). */
export const RequiresFeature = (key: FeatureKey) => SetMetadata(FEATURE, key);

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<FeatureKey | undefined>(FEATURE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (key && !(await this.settings.isEnabled(key)))
      throw new ApiError(403, 'feature_disabled', { feature: key });
    return true;
  }
}
