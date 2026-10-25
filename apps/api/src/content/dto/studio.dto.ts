import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const L10N_EXAMPLE = { te: 'పలకరింపులు', en: 'Greetings' };
const SCREEN_TYPES = ['explain', 'vocab', 'dialogue', 'practice'] as const;
const QUESTION_TYPES = ['mcq', 'listen_choose', 'match_pairs', 'fill_gap', 'word_order'] as const;

/** Drafts may be incomplete; Telugu + English completeness is enforced on submit for review. */
export class ScreenInputDto {
  @ApiProperty({ description: 'Stable id chosen by the studio (UUID); keep it across saves' })
  @IsUUID()
  id!: string;

  @ApiProperty({ enum: SCREEN_TYPES })
  @IsIn(SCREEN_TYPES)
  type!: (typeof SCREEN_TYPES)[number];

  @ApiProperty({
    description:
      'Type-specific fields as in the lesson-pack schema (body, vocabIds, lines, prompt/target)',
  })
  @IsObject()
  body!: Record<string, unknown>;
}

export class QuestionInputDto {
  @ApiProperty({
    description: 'Stable id (UUID). Never reuse an id for a different question (ADR-008)',
  })
  @IsUUID()
  id!: string;

  @ApiProperty({ enum: QUESTION_TYPES })
  @IsIn(QUESTION_TYPES)
  type!: (typeof QUESTION_TYPES)[number];

  @ApiProperty({ example: L10N_EXAMPLE }) @IsObject() prompt!: Record<string, string>;
  @ApiProperty({ example: { options: ['Hallo', 'Tschüss'] } }) @IsObject() payload!: Record<
    string,
    unknown
  >;
  @ApiProperty({ example: 0, description: 'Shape depends on the question type' })
  @IsDefined()
  answer!: unknown;
  @ApiProperty({ example: L10N_EXAMPLE }) @IsObject() explanation!: Record<string, string>;

  @ApiProperty({ minimum: 1, maximum: 3 })
  @IsInt()
  @Min(1)
  @Max(3)
  difficulty!: number;
}

export class CreateLessonDto {
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] })
  @IsIn(['A1', 'A2', 'B1'])
  level!: 'A1' | 'A2' | 'B1';

  @ApiProperty({ example: L10N_EXAMPLE }) @IsObject() title!: Record<string, string>;
}

export class UpdateLessonDto {
  @ApiProperty({
    description: 'The revision this edit started from; a newer one on the server gives 409',
  })
  @IsInt()
  expectedRevision!: number;

  @ApiProperty({ example: L10N_EXAMPLE }) @IsObject() title!: Record<string, string>;
  @ApiProperty({ example: L10N_EXAMPLE }) @IsObject() description!: Record<string, string>;

  @ApiProperty({ minimum: 1, maximum: 120 })
  @IsInt()
  @Min(1)
  @Max(120)
  estMinutes!: number;

  @ApiProperty({ type: [String], example: ['construction'] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tradeTags!: string[];

  @ApiProperty({ type: [ScreenInputDto] })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ScreenInputDto)
  screens!: ScreenInputDto[];

  @ApiProperty({ type: [QuestionInputDto] })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => QuestionInputDto)
  questions!: QuestionInputDto[];
}

export class TransitionDto {
  @ApiProperty({ enum: ['in_review', 'approved', 'draft'] })
  @IsIn(['in_review', 'approved', 'draft'])
  to!: 'in_review' | 'approved' | 'draft';

  @ApiPropertyOptional({
    description: 'Required when a reviewer sends a lesson back',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  comment?: string;
}

export class CommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  body!: string;
}

export class RollbackDto {
  @ApiProperty({ description: 'Revision to restore; it becomes a new draft revision' })
  @IsInt()
  @Min(1)
  revision!: number;
}

export class LessonOrderDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  lessonIds!: string[];
}

export class VocabInputDto {
  @ApiProperty({ example: 'Hallo' }) @IsString() @Length(1, 120) german!: string;
  @ApiPropertyOptional({ description: 'Media id of the native-speaker recording (FR-302)' })
  @IsOptional()
  @IsUUID()
  audioId?: string;
  @ApiPropertyOptional({ enum: ['der', 'die', 'das'] })
  @IsOptional()
  @IsIn(['der', 'die', 'das'])
  article?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) plural?: string;
  @ApiProperty({ example: { te: 'హలో', en: 'hello' } }) @IsObject() meaning!: Record<
    string,
    string
  >;
  @ApiPropertyOptional() @IsOptional() @IsUUID() imageId?: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tradeTags!: string[];
}

export class VocabQueryDto {
  @ApiPropertyOptional({ description: 'Search the German word' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}

// ── Responses ──

export class LessonSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] }) level!: string;
  @ApiProperty() order!: number;
  @ApiProperty({ example: L10N_EXAMPLE }) title!: Record<string, string>;
  @ApiProperty({ enum: ['draft', 'in_review', 'approved', 'published'] }) status!: string;
  @ApiProperty() revision!: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) publishedRevision!: number | null;
  @ApiProperty() updatedAt!: Date;
}

export class ScreenDto extends ScreenInputDto {
  @ApiProperty() order!: number;
}

export class ReviewCommentDto {
  @ApiProperty() id!: string;
  @ApiProperty() revision!: number;
  @ApiProperty() authorId!: string;
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: Date;
}

export class LessonDetailDto extends LessonSummaryDto {
  @ApiProperty({ example: L10N_EXAMPLE }) description!: Record<string, string>;
  @ApiProperty() estMinutes!: number;
  @ApiProperty({ type: [String] }) tradeTags!: string[];
  @ApiProperty({ type: [ScreenDto] }) screens!: ScreenDto[];
  @ApiProperty({ type: [QuestionInputDto] }) questions!: QuestionInputDto[];
  @ApiProperty({ type: [ReviewCommentDto] }) comments!: ReviewCommentDto[];
  @ApiProperty() updatedBy!: string;
}

export class RevisionDto {
  @ApiProperty() revision!: number;
  @ApiProperty({ enum: ['draft', 'in_review', 'approved', 'published'] }) status!: string;
  @ApiProperty() createdBy!: string;
  @ApiProperty() createdAt!: Date;
}

export class VocabDto extends VocabInputDto {
  @ApiProperty() id!: string;
  @ApiProperty() updatedAt!: Date;
}

export class LevelDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] }) code!: string;
  @ApiProperty({ example: { te: 'A1 – ప్రారంభ స్థాయి', en: 'A1 – Beginner' } }) title!: Record<
    string,
    string
  >;
  @ApiProperty() lessonCount!: number;
}
