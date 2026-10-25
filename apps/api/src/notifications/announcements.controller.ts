import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { AnnouncementsService } from './announcements.service.js';

export class AnnouncementDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: { te: 'రేపు తరగతి లేదు', en: 'No class tomorrow' } })
  title!: Record<string, string>;
  @ApiProperty({ example: { te: '...', en: '...' } })
  body!: Record<string, string>;
  @ApiProperty() startsAt!: Date;
  @ApiProperty({ nullable: true, type: Date }) endsAt!: Date | null;
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  /** FR-205: newest first, at most 5, for everyone or the learner's batch. */
  @Get()
  @Roles('learner')
  @ApiOkResponse({ type: [AnnouncementDto] })
  list(@Auth() auth: AccessClaims): Promise<AnnouncementDto[]> {
    return this.announcements.activeFor(auth.userId);
  }
}
