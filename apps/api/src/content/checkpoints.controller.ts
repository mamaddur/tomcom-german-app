import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseEnumPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { CheckpointShape } from '@tomcom/content-schema';
import { IsInt, IsObject, Min } from 'class-validator';
import { ApiError } from '../common/api-error.js';
import type { LevelCode } from '../generated/prisma/client.js';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { type CheckpointView, CheckpointsService } from './checkpoints.service.js';

export class CheckpointDto {
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] }) level!: string;
  @ApiProperty({ description: 'content-schema `checkpoint`: passMark, draw, sections' })
  content!: object;
  @ApiProperty({ description: '0 before the first save' }) revision!: number;
  @ApiProperty({ nullable: true, type: Date }) updatedAt!: Date | null;
  @ApiProperty({ nullable: true, type: Number }) publishedRevision!: number | null;
  @ApiProperty({ nullable: true, type: Date }) publishedAt!: Date | null;
  @ApiProperty({ type: [String], description: 'What blocks publishing; empty when ready' })
  problems!: string[];
}

export class SaveCheckpointDto {
  @ApiProperty() @IsInt() @Min(0) expectedRevision!: number;
  @ApiProperty({ description: 'content-schema `checkpoint`; drafts may be incomplete' })
  @IsObject()
  content!: CheckpointShape;
}

const MAX_BYTES = 512 * 1024;

/** Drafts may have empty text, but their shape must be right so the editor can load them. */
function assertShape(c: CheckpointShape) {
  const ok =
    typeof c.passMark === 'number' &&
    c.draw !== null &&
    typeof c.draw === 'object' &&
    ['reading', 'listening', 'writing'].every(
      (s) =>
        Number.isInteger(c.draw[s as 'reading']) &&
        Array.isArray(c.sections?.[s as 'reading']) &&
        c.sections[s as 'reading'].length <= 200,
    ) &&
    Object.keys(c).every((k) => ['passMark', 'draw', 'sections'].includes(k));
  if (!ok || JSON.stringify(c).length > MAX_BYTES) {
    throw new ApiError(400, 'validation_failed', { field: 'content' });
  }
}

const level = new ParseEnumPipe(['A1', 'A2', 'B1']);

/** FR-404 checkpoint authoring in the studio. */
@ApiTags('studio')
@ApiBearerAuth()
@Roles('author', 'reviewer', 'super_admin')
@Controller('studio/checkpoints')
export class CheckpointsController {
  constructor(private readonly checkpoints: CheckpointsService) {}

  @Get()
  @ApiOkResponse({ type: [CheckpointDto] })
  list(): Promise<CheckpointView[]> {
    return this.checkpoints.list();
  }

  @Get(':level')
  @ApiOkResponse({ type: CheckpointDto })
  get(@Param('level', level) lv: LevelCode): Promise<CheckpointView> {
    return this.checkpoints.get(lv);
  }

  @Put(':level')
  @Roles('author')
  @ApiOkResponse({ type: CheckpointDto })
  save(
    @Param('level', level) lv: LevelCode,
    @Body() dto: SaveCheckpointDto,
    @Auth() auth: AccessClaims,
  ): Promise<CheckpointView> {
    assertShape(dto.content);
    return this.checkpoints.save(lv, dto.expectedRevision, dto.content, auth);
  }

  /** A reviewer who did not make the last edit publishes the draft (four eyes). */
  @Post(':level/publish')
  @HttpCode(200)
  @Roles('reviewer', 'super_admin')
  @ApiOkResponse({ type: CheckpointDto })
  publish(
    @Param('level', level) lv: LevelCode,
    @Auth() auth: AccessClaims,
    @Ip() ip: string,
  ): Promise<CheckpointView> {
    return this.checkpoints.publish(lv, auth, ip);
  }
}
