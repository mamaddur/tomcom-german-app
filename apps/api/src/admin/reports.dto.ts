import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** FR-903: the filters every report shares, so dashboard and export agree (story 6). */
export class ReportFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() batchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) districtCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) tradeCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() trainerId?: string;
  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'IST date; default 29 days before `to`',
  })
  @IsOptional()
  @Matches(DATE)
  from?: string;
  @ApiPropertyOptional({ example: '2026-10-30', description: 'IST date, inclusive; default today' })
  @IsOptional()
  @Matches(DATE)
  to?: string;
  @ApiPropertyOptional({ enum: ['A1', 'A2', 'B1'] })
  @IsOptional()
  @IsIn(['A1', 'A2', 'B1'])
  level?: 'A1' | 'A2' | 'B1';
}

export class LevelCompletionDto {
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] }) level!: string;
  @ApiProperty({ description: 'Published lessons in the level' }) lessons!: number;
  @ApiProperty({ description: 'Learners who passed every published lesson by `to`' })
  completed!: number;
}

export class LessonFunnelDto {
  @ApiProperty() lessonId!: string;
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] }) level!: string;
  @ApiProperty() order!: number;
  @ApiProperty({ example: { te: 'పలకరింపులు', en: 'Greetings' } }) title!: Record<string, string>;
  @ApiProperty({ description: 'Learners with at least one quiz attempt' }) attempted!: number;
  @ApiProperty() passed!: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) averageBestScore!: number | null;
  @ApiProperty({ description: 'Passed the lesson before but not this one: where learners stop' })
  dropOff!: number;
}

export class OverviewDto {
  @ApiProperty({ example: '2026-10-01' }) from!: string;
  @ApiProperty({ example: '2026-10-30' }) to!: string;
  @ApiProperty({ description: 'Learners matching the filters' }) learners!: number;
  @ApiProperty({ description: 'Learners who learned on at least one day in the range' })
  activeLearners!: number;
  @ApiProperty({ description: 'Minutes of learning in the range' }) minutes!: number;
  @ApiProperty({ description: 'Quiz attempts in the range' }) attempts!: number;
  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Mean attempt score, 0–1' })
  averageScore!: number | null;
  @ApiProperty({ type: [LevelCompletionDto] }) completions!: LevelCompletionDto[];
  @ApiProperty({ type: [LessonFunnelDto] }) lessons!: LessonFunnelDto[];
}

export class LearnerRowDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) firstName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) lastName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) batchCode!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) districtCode!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) tradeCode!: string | null;
  @ApiProperty() lessonsPassed!: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) averageScore!: number | null;
  @ApiProperty({ description: 'Minutes of learning in the range' }) minutes!: number;
  @ApiPropertyOptional({ nullable: true, type: Date }) lastSeenAt!: Date | null;
}

export class AttemptRowDto {
  @ApiProperty() lessonId!: string;
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] }) level!: string;
  @ApiProperty() lessonOrder!: number;
  @ApiProperty() lessonTitle!: Record<string, string>;
  @ApiProperty() score!: number;
  @ApiProperty() passed!: boolean;
  @ApiProperty() durationMs!: number;
  @ApiProperty() finishedAt!: Date;
}

export class LearnerDetailDto extends LearnerRowDto {
  @ApiProperty({ example: '+91 •••••• 0101' }) phone!: string;
  @ApiProperty() uiLocale!: string;
  @ApiProperty() registeredAt!: Date;
  @ApiProperty({ type: [AttemptRowDto], description: 'Newest first, at most 200' })
  attempts!: AttemptRowDto[];
  @ApiProperty({ description: 'Learning seconds per IST day, last 60 days' })
  activity!: Array<{ date: string; seconds: number }>;
  @ApiProperty({ description: 'Pronunciation scores (step 6); empty until then', type: [Object] })
  pronunciation!: unknown[];
  @ApiProperty({
    description: 'AI tutor messages per day (step 7); empty until then',
    type: [Object],
  })
  tutorUsage!: unknown[];
}
