import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { SUPPORTED_LOCALES } from '../../common/locales.js';

const LEVELS = ['none', 'A1', 'A2', 'B1'] as const;
/** Letters in any script (Telugu included), combining marks, spaces, dots, hyphens, apostrophes. */
const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;

export class UpdateLocaleDto {
  @ApiProperty({ enum: SUPPORTED_LOCALES })
  @IsIn(SUPPORTED_LOCALES)
  locale!: string;
}

export class UpdateProfileDto {
  @ApiProperty({ example: 'Ravi', maxLength: 50 })
  @IsString()
  @Length(1, 50)
  @Matches(NAME)
  firstName!: string;

  @ApiPropertyOptional({ example: 'Kumar', maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  @Matches(NAME)
  lastName?: string;

  @ApiProperty({ example: 'warangal', description: 'Code from GET /reference/districts' })
  @IsString()
  @MaxLength(40)
  districtCode!: string;

  @ApiProperty({ example: 'electrician', description: 'Code from GET /reference/trades' })
  @IsString()
  @MaxLength(40)
  tradeCode!: string;

  @ApiPropertyOptional({ example: 'Electrician in Munich', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  targetJob?: string;

  @ApiProperty({ enum: LEVELS, description: 'Self-declared current German level' })
  @IsIn(LEVELS)
  selfDeclaredLevel!: (typeof LEVELS)[number];
}

export class JoinBatchDto {
  @ApiProperty({ example: 'TST-001', maxLength: 20 })
  @IsString()
  @Length(3, 20)
  code!: string;
}

export class ProfileDto {
  @ApiProperty() districtCode!: string;
  @ApiProperty() tradeCode!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) targetJob!: string | null;
  @ApiProperty({ enum: LEVELS }) selfDeclaredLevel!: string;
}

export class BatchSummaryDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() enrolledAt!: Date;
}

export class MeOnboardingDto {
  @ApiProperty() profileComplete!: boolean;
  @ApiProperty() batchJoined!: boolean;
}

export class MeDto {
  @ApiProperty() id!: string;
  @ApiProperty() role!: string;
  @ApiProperty({ enum: SUPPORTED_LOCALES }) uiLocale!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) firstName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) lastName!: string | null;
  @ApiPropertyOptional({ type: ProfileDto, nullable: true }) profile!: ProfileDto | null;
  @ApiPropertyOptional({ type: BatchSummaryDto, nullable: true }) batch!: BatchSummaryDto | null;
  @ApiProperty({ type: MeOnboardingDto }) onboarding!: MeOnboardingDto;
}
