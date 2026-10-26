import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { SyncRequestDto, SyncResponseDto } from './dto/sync.dto.js';
import { SyncService } from './sync.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Sends quiz attempts and learning time; returns the learner's results (FR-405, NFR-05). */
  @Post()
  @HttpCode(200)
  @Roles('learner')
  @ApiOkResponse({ type: SyncResponseDto })
  post(@Auth() auth: AccessClaims, @Body() dto: SyncRequestDto): Promise<SyncResponseDto> {
    return this.sync.sync(auth.userId, dto);
  }
}
