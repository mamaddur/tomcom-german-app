import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AttemptAnswerDto {
  @ApiProperty() @IsString() @MaxLength(64) questionId!: string;
  @ApiProperty({ description: 'Option index, or list of indices for pairs and word order' })
  @IsDefined()
  response!: unknown;
  @ApiProperty() @IsBoolean() correct!: boolean;
}

/** One lesson-quiz attempt from the app's outbox (FR-405). */
export class AttemptDto {
  @ApiProperty({ description: 'Client-generated UUID; a resend with the same id is ignored' })
  @IsUUID()
  id!: string;
  @ApiProperty() @IsUUID() lessonId!: string;
  @ApiProperty() @IsInt() @Min(1) packVersion!: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() @Min(0) @Max(1) score!: number;
  @ApiProperty() @IsBoolean() passed!: boolean;
  @ApiProperty({ maximum: 10_800_000 }) @IsInt() @Min(0) @Max(10_800_000) durationMs!: number;
  @ApiProperty({ type: [AttemptAnswerDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AttemptAnswerDto)
  answers!: AttemptAnswerDto[];
  @ApiProperty() @IsDateString() finishedAt!: string;
}

/** Learning time on one IST day (FR-204). The app sends its running total; the larger wins. */
export class ActivityDto {
  @ApiProperty({ example: '2026-10-25' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
  @ApiProperty({ maximum: 86_400 }) @IsInt() @Min(0) @Max(86_400) seconds!: number;
}

/** FR-308: one word-list entry as the phone last saw it. */
export class WordDto {
  @ApiProperty() @IsUUID() vocabId!: string;
  @ApiProperty({ minimum: 0, maximum: 5 }) @IsInt() @Min(0) @Max(5) box!: number;
  @ApiProperty({ example: '2026-10-27', description: 'Next review day (IST)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  due!: string;
  @ApiProperty() @IsBoolean() removed!: boolean;
  @ApiProperty() @IsDateString() updatedAt!: string;
}

export class SyncRequestDto {
  @ApiProperty({ type: [AttemptDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AttemptDto)
  attempts!: AttemptDto[];

  @ApiProperty({ type: [ActivityDto], maxItems: 60 })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ActivityDto)
  activity!: ActivityDto[];

  @ApiPropertyOptional({ type: [WordDto], maxItems: 500 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => WordDto)
  words?: WordDto[];
}

export class LessonResultDto {
  @ApiProperty() lessonId!: string;
  @ApiProperty() bestScore!: number;
  @ApiProperty() passed!: boolean;
}

export class SyncResponseDto {
  @ApiProperty({
    type: [String],
    description: 'Attempt ids the server now holds; remove them from the outbox',
  })
  stored!: string[];
  @ApiProperty({ type: [LessonResultDto], description: "All of the learner's lesson results" })
  lessons!: LessonResultDto[];
  @ApiProperty({ type: [ActivityDto], description: 'Learning time for the last 60 days' })
  activity!: ActivityDto[];
  @ApiProperty({ type: [WordDto], description: 'The whole word list, including removals' })
  words!: WordDto[];
}
