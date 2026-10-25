import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { JoinBatchDto, MeDto, UpdateLocaleDto, UpdateProfileDto } from './dto/me.dto.js';
import { MeService } from './me.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @ApiOkResponse({ type: MeDto })
  get(@Auth() auth: AccessClaims): Promise<MeDto> {
    return this.me.get(auth.userId);
  }

  @Put('locale')
  @ApiOkResponse({ type: MeDto })
  setLocale(@Auth() auth: AccessClaims, @Body() dto: UpdateLocaleDto): Promise<MeDto> {
    return this.me.setLocale(auth.userId, dto.locale);
  }

  @Put('profile')
  @Roles('learner')
  @ApiOkResponse({ type: MeDto })
  setProfile(@Auth() auth: AccessClaims, @Body() dto: UpdateProfileDto): Promise<MeDto> {
    return this.me.setProfile(auth.userId, dto);
  }

  @Post('batch')
  @HttpCode(200)
  @Roles('learner')
  @ApiOkResponse({ type: MeDto })
  joinBatch(@Auth() auth: AccessClaims, @Body() dto: JoinBatchDto): Promise<MeDto> {
    return this.me.joinBatch(auth.userId, dto.code);
  }
}
