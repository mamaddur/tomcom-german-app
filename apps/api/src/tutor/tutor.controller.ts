import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { RequiresFeature } from '../settings/feature.guard.js';
import {
  TutorFlagQueueItemDto,
  TutorFlagRequestDto,
  TutorFlagResolveDto,
  TutorHistoryItemDto,
  TutorReplyDto,
  TutorSendDto,
} from './dto/tutor.dto.js';
import { TutorService } from './tutor.service.js';

/** The learner's side of the AI tutor (FR-601, FR-607, FR-608). */
@ApiTags('tutor')
@ApiBearerAuth()
@Roles('learner')
@RequiresFeature('module.tutor')
@Controller('tutor')
export class TutorController {
  constructor(private readonly tutor: TutorService) {}

  @Post('messages')
  @HttpCode(200)
  @ApiOkResponse({ type: TutorReplyDto })
  send(@Auth() auth: AccessClaims, @Body() dto: TutorSendDto): Promise<TutorReplyDto> {
    return this.tutor.send(auth.userId, dto);
  }

  @Get('messages')
  @ApiOkResponse({ type: [TutorHistoryItemDto] })
  history(@Auth() auth: AccessClaims): Promise<TutorHistoryItemDto[]> {
    return this.tutor.history(auth.userId);
  }

  @Post('messages/:id/flag')
  @HttpCode(204)
  @ApiNoContentResponse()
  async flag(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TutorFlagRequestDto,
  ): Promise<void> {
    await this.tutor.flag(auth.userId, id, dto.reason);
  }
}

/** FR-608: flagged answers wait in a queue for a reviewer. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('reviewer', 'tomcom_admin', 'super_admin')
@Controller('admin/tutor/flags')
export class AdminTutorController {
  constructor(private readonly tutor: TutorService) {}

  @Get()
  @ApiOkResponse({ type: [TutorFlagQueueItemDto] })
  list(@Query('status') status?: string): Promise<TutorFlagQueueItemDto[]> {
    return this.tutor.flagQueue(status === 'resolved' ? 'resolved' : 'open');
  }

  @Post(':id/resolve')
  @HttpCode(204)
  @ApiNoContentResponse()
  async resolve(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TutorFlagResolveDto,
  ): Promise<void> {
    await this.tutor.resolveFlag(auth.userId, id, dto.note);
  }
}
