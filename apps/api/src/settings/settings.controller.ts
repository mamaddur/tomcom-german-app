import { Body, Controller, Get, Ip, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsDefined } from 'class-validator';
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
  async appConfig(): Promise<AppConfigDto> {
    const flags = await this.settings.listFlags();
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
    };
  }
}
