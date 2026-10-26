import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import type { Response } from 'express';
import { ApiError } from '../common/api-error.js';
import type { LevelCode } from '../generated/prisma/client.js';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { MediaService } from '../media/media.service.js';
import { CheckpointAttemptsService } from './checkpoint-attempts.service.js';

const MAX_BYTES = 64 * 1024;
const assertSmall = (v: unknown) => {
  if (JSON.stringify(v).length > MAX_BYTES) throw new ApiError(413, 'payload_too_large');
};

export class SubmitAttemptDto {
  @ApiProperty({ description: '{ questionId: response } for reading and listening' })
  @IsObject()
  answers!: Record<string, unknown>;
  @ApiProperty({ description: '{ taskId: text } for writing' })
  @IsObject()
  writing!: Record<string, string>;
}

export class MarkAttemptDto {
  @ApiProperty({ description: '{ taskId: { score: 0–1, comment? } }' })
  @IsObject()
  marks!: Record<string, { score: number; comment?: string }>;
}

export class CheckpointAttemptSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['in_progress', 'awaiting_marking', 'passed', 'failed', 'expired'] })
  status!: string;
  @ApiProperty({ nullable: true, type: Number }) total!: number | null;
  @ApiProperty({ nullable: true, type: Object }) sectionScores!: Record<string, number> | null;
  @ApiProperty() passMark!: number;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({ nullable: true, type: Date }) submittedAt!: Date | null;
}

export class CheckpointStatusDto {
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] }) level!: string;
  @ApiProperty({ description: 'A published checkpoint exists' }) available!: boolean;
  @ApiProperty() lessons!: number;
  @ApiProperty() lessonsPassed!: number;
  @ApiProperty({ description: 'Every published lesson of the level is passed' }) eligible!: boolean;
  @ApiProperty() passed!: boolean;
  @ApiProperty({ nullable: true, type: CheckpointAttemptSummaryDto })
  latest!: CheckpointAttemptSummaryDto | null;
}

export class CheckpointAttemptDto extends CheckpointAttemptSummaryDto {
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] }) level!: string;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty({
    nullable: true,
    type: Object,
    description: 'Questions without answers while the attempt is open; null afterwards',
  })
  sections!: unknown;
}

const level = new ParseEnumPipe(['A1', 'A2', 'B1']);

/** FR-404: learners take level checkpoints online (ADR-009). */
@ApiTags('me')
@ApiBearerAuth()
@Roles('learner')
@Controller('checkpoints')
export class LearnerCheckpointsController {
  constructor(
    private readonly attempts: CheckpointAttemptsService,
    private readonly media: MediaService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [CheckpointStatusDto] })
  overview(@Auth() auth: AccessClaims) {
    return this.attempts.overview(auth.userId);
  }

  /** Starts an attempt, or resumes the open one. */
  @Post(':level/attempts')
  @HttpCode(200)
  @ApiOkResponse({ type: CheckpointAttemptDto })
  start(@Auth() auth: AccessClaims, @Param('level', level) lv: LevelCode) {
    return this.attempts.start(auth.userId, lv);
  }

  @Get('attempts/:id')
  @ApiOkResponse({ type: CheckpointAttemptDto })
  get(@Auth() auth: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.view(id, auth.userId);
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  @ApiOkResponse({ type: CheckpointAttemptDto })
  submit(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    assertSmall(dto);
    return this.attempts.submit(id, auth.userId, { answers: dto.answers, writing: dto.writing });
  }

  /** A listening recording of the learner's own attempt. */
  @Get('attempts/:id/media/:mediaId')
  async mediaFile(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.attempts.mediaFor(id, auth.userId, mediaId);
    const { asset, body } = await this.media.content(mediaId);
    res
      .set({
        'Content-Type': asset.mime,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(body);
  }
}

/** Trainers mark writing for their batches; admins for all (FR-407 trainer part, FR-908). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('trainer', 'tomcom_admin', 'super_admin')
@Controller('admin/marking')
export class MarkingController {
  constructor(private readonly attempts: CheckpointAttemptsService) {}

  @Get()
  @ApiOkResponse({ description: 'Attempts waiting for writing marks, oldest first' })
  queue(@Auth() auth: AccessClaims) {
    return this.attempts.markingQueue(auth);
  }

  @Post(':id')
  @HttpCode(200)
  @ApiOkResponse({ description: 'The final result' })
  mark(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkAttemptDto,
    @Ip() ip: string,
  ) {
    assertSmall(dto);
    return this.attempts.mark(auth, id, dto.marks, ip);
  }
}
