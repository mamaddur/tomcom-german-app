import { Body, Controller, Get, Ip, Param, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean, IsDefined, IsIn, IsOptional, Matches } from 'class-validator';
import { Auth, Public, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { SettingsService } from './settings.service.js';

export class SettingDto {
  @ApiProperty({ example: 'quiz.passMark' }) key!: string;
  @ApiProperty({ example: 0.8 }) value!: unknown;
  @ApiProperty({ example: 0.8 }) default!: unknown;
  @ApiProperty() description!: string;
}

export class FeatureFlagDto {
  @ApiProperty({ example: 'module.tutor' }) key!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() default!: boolean;
  @ApiProperty() description!: string;
}

export class SetSettingDto {
  @ApiProperty({ example: 0.8, description: 'Must be within the range defined for the setting' })
  @IsDefined()
  value!: unknown;
}

export class SetFlagDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
}

/** Rules the app applies offline: unlocking (FR-402) and the daily goal (FR-204). */
export class LearningRulesDto {
  @ApiProperty({ example: 0.8 }) passMark!: number;
  @ApiProperty({ example: true }) sequentialUnlock!: boolean;
  @ApiProperty({ example: 10 }) dailyGoalMinutes!: number;
}

export class MaintenanceDto {
  @ApiProperty() active!: boolean;
  @ApiProperty({ example: { te: '...', en: 'Back at 6 pm' } }) message!: Record<string, string>;
}

export class AppConfigQueryDto {
  @ApiPropertyOptional({ enum: ['android', 'ios'] })
  @IsOptional()
  @IsIn(['android', 'ios'])
  platform?: string;
  @ApiPropertyOptional({ example: '0.1.0' })
  @IsOptional()
  @Matches(/^\d+\.\d+\.\d+$/)
  version?: string;
}

/** Compares dotted versions numerically: 0.10.0 is newer than 0.9.9. */
export const older = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! < pb[i]!;
  return false;
};

export class AppConfigDto {
  @ApiProperty({
    example: { 'module.tutor': true },
    description: 'Which optional modules the app should show',
  })
  features!: Record<string, boolean>;
  @ApiProperty({ example: { 'tutor.dailyMessageLimit': 30 } })
  limits!: Record<string, number>;
  @ApiProperty({ type: LearningRulesDto })
  learning!: LearningRulesDto;
  @ApiProperty({
    enum: ['none', 'optional', 'required'],
    description: 'FR-1102, for the `version` sent; `none` when no version is sent',
  })
  update!: 'none' | 'optional' | 'required';
  @ApiProperty({ type: MaintenanceDto }) maintenance!: MaintenanceDto;
}

/** FR-1101, FR-1103. Super admins change settings and flags; TOMCOM admins can read them. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('admin/settings')
  @Roles('super_admin', 'tomcom_admin')
  @ApiOkResponse({ type: [SettingDto] })
  list(): Promise<SettingDto[]> {
    return this.settings.listSettings();
  }

  @Put('admin/settings/:key')
  @Roles('super_admin')
  @ApiOkResponse({ type: SettingDto })
  set(
    @Param('key') key: string,
    @Body() dto: SetSettingDto,
    @Auth() auth: AccessClaims,
    @Ip() ip: string,
  ): Promise<SettingDto> {
    return this.settings.setSetting(key, dto.value, auth, ip);
  }

  @Get('admin/feature-flags')
  @Roles('super_admin', 'tomcom_admin')
  @ApiOkResponse({ type: [FeatureFlagDto] })
  flags(): Promise<FeatureFlagDto[]> {
    return this.settings.listFlags();
  }

  @Put('admin/feature-flags/:key')
  @Roles('super_admin')
  @ApiOkResponse({ type: FeatureFlagDto })
  setFlag(
    @Param('key') key: string,
    @Body() dto: SetFlagDto,
    @Auth() auth: AccessClaims,
    @Ip() ip: string,
  ): Promise<FeatureFlagDto> {
    return this.settings.setFlag(key, dto.enabled, auth, ip);
  }

  /** What the learner app needs at start-up. Public: no personal data, same for everyone. */
  @Public()
  @Get('app/config')
  @ApiOkResponse({ type: AppConfigDto })
  async appConfig(@Query() q: AppConfigQueryDto): Promise<AppConfigDto> {
    const flags = await this.settings.listFlags();
    const [min, latest, maintenance] = await Promise.all([
      this.settings.get('app.minVersion'),
      this.settings.get('app.latestVersion'),
      this.settings.get('app.maintenance'),
    ]);
    return {
      features: Object.fromEntries(flags.map((f) => [f.key, f.enabled])),
      limits: {
        'tutor.dailyMessageLimit': await this.settings.get('tutor.dailyMessageLimit'),
        'pronunciation.dailyAttemptLimit': await this.settings.get(
          'pronunciation.dailyAttemptLimit',
        ),
      },
      learning: {
        passMark: await this.settings.get('quiz.passMark'),
        sequentialUnlock: await this.settings.get('unlock.sequential'),
        dailyGoalMinutes: await this.settings.get('goal.dailyMinutes'),
      },
      update: !q.version
        ? 'none'
        : older(q.version, min)
          ? 'required'
          : older(q.version, latest)
            ? 'optional'
            : 'none',
      maintenance: { active: maintenance.active, message: maintenance.message },
    };
  }
}
