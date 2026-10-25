import { Body, Controller, Get, Header, HttpCode, Ip, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Equals } from 'class-validator';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrivacyService } from './privacy.service.js';

export class EraseAccountDto {
  @ApiProperty({ example: true, description: 'Must be true: the app asks the learner first' })
  @Equals(true)
  confirm!: boolean;
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** FR-804: everything held about the learner, as JSON. */
  @Get('export')
  @Roles('learner')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Disposition', 'attachment; filename="my-data.json"')
  @ApiOkResponse({ description: "The learner's data as JSON" })
  export(@Auth() auth: AccessClaims, @Ip() ip: string) {
    return this.privacy.export(auth.userId, ip);
  }

  /** FR-804: erase the account now (DPDP Act 2023). */
  @Post('erase')
  @HttpCode(204)
  @Roles('learner')
  @ApiNoContentResponse()
  async erase(
    @Auth() auth: AccessClaims,
    @Body() _dto: EraseAccountDto,
    @Ip() ip: string,
  ): Promise<void> {
    await this.privacy.erase(auth.userId, ip);
  }
}
