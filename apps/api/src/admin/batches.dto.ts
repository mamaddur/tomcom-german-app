import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class TrainerDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class BatchDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'WGL-ELEC-01' }) code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) districtCode!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) tradeCode!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, example: '2026-11-01' })
  startDate!: string | null;
  @ApiProperty({ enum: ['active', 'closed'] }) status!: string;
  @ApiProperty() learnerCount!: number;
  @ApiProperty({ description: 'Uploaded numbers that have not signed up yet' })
  pendingInvites!: number;
  @ApiProperty({ type: [TrainerDto] }) trainers!: TrainerDto[];
}

const CODE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;

export class CreateBatchDto {
  @ApiProperty({ example: 'WGL-ELEC-01', description: 'Learners type this to join (FR-106)' })
  @Matches(CODE)
  code!: string;
  @ApiProperty() @IsString() @Length(2, 80) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) districtCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) tradeCode?: string;
  @ApiPropertyOptional({ example: '2026-11-01' }) @IsOptional() @IsDateString() startDate?: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  trainerIds!: string[];
}

export class UpdateBatchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) name?: string;
  @ApiPropertyOptional({ enum: ['active', 'closed'] })
  @IsOptional()
  @IsIn(['active', 'closed'])
  status?: 'active' | 'closed';
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  trainerIds?: string[];
}

export class ImportResultDto {
  @ApiProperty({ description: 'Already learners: moved into this batch now' }) enrolled!: number;
  @ApiProperty({ description: 'Not signed up yet: they join when they register' }) invited!: number;
  @ApiProperty({ description: 'Already in this batch, or listed twice' }) unchanged!: number;
  @ApiProperty({
    description: 'Rows that are not Indian mobile numbers (row numbers only, never the value)',
    type: [Number],
  })
  invalidRows!: number[];
}

export class BatchLearnerDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) firstName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) lastName!: string | null;
  @ApiProperty({ example: '+91 •••••• 0101' }) phone!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) districtCode!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) tradeCode!: string | null;
  @ApiProperty({ enum: ['code', 'admin', 'bulk'] }) source!: string;
  @ApiProperty() joinedAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: Date }) lastSeenAt!: Date | null;
  @ApiProperty() lessonsPassed!: number;
}
