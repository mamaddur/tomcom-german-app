import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class TutorSendDto {
  @ApiProperty({ description: 'What the learner wrote, up to 500 characters' })
  @IsString()
  text!: string;

  @ApiProperty({ enum: ['A1', 'A2', 'B1'], description: 'The level the learner is studying' })
  @IsIn(['A1', 'A2', 'B1'])
  level!: 'A1' | 'A2' | 'B1';

  @ApiPropertyOptional({ description: 'The lesson the learner has open, if any' })
  @IsOptional()
  @IsUUID()
  lessonId?: string;
}

export class TutorReplyDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'The reply; German phrases are wrapped in <de>…</de> (FR-603)' })
  reply!: string;
  @ApiProperty({ type: [String], description: 'The marked German phrases, in order' })
  germanPhrases!: string[];
  @ApiProperty({ description: 'Messages left today (FR-607)' }) remainingToday!: number;
  @ApiProperty({ description: 'True when the reply came from the built-in demo stand-in' })
  demo!: boolean;
  @ApiProperty({ description: 'True when the safety filter replaced the reply (FR-606)' })
  filtered!: boolean;
}

export class TutorHistoryItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['user', 'assistant'] }) role!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: [String] }) germanPhrases!: string[];
  @ApiProperty({ description: 'The learner already flagged this reply (FR-608)' })
  flagged!: boolean;
  @ApiProperty() createdAt!: Date;
}

export class TutorFlagRequestDto {
  @ApiProperty({ description: 'What was wrong with the answer' })
  @IsString()
  @Length(1, 300)
  reason!: string;
}

export class TutorFlagQueueItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['open', 'resolved'] }) status!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: ['A1', 'A2', 'B1', 'none'] }) level!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'What the learner asked' })
  question!: string | null;
  @ApiProperty({ description: 'The tutor reply that was flagged' }) answer!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) note!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class TutorFlagResolveDto {
  @ApiPropertyOptional({ description: 'What was decided, for the record' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}
