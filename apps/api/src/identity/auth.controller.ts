import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '../generated/prisma/client.js';
import { AccountService } from './account.service.js';
import { Public } from './auth.guard.js';
import {
  OtpRequestDto,
  OtpRequestResultDto,
  OtpVerifyDto,
  OtpVerifyResultDto,
  RefreshDto,
  RegisterDto,
  SessionDto,
  TokensDto,
  UserSummaryDto,
} from './dto/auth.dto.js';
import { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly accounts: AccountService,
    private readonly tokens: TokenService,
  ) {}

  /** FR-101: send a one-time code by SMS. */
  @Post('otp/request')
  @HttpCode(202)
  @ApiOkResponse({ type: OtpRequestResultDto })
  requestOtp(@Body() dto: OtpRequestDto, @Ip() ip: string): Promise<OtpRequestResultDto> {
    return this.otp.request(dto.phone, dto.locale, ip);
  }

  /** FR-101, FR-107: existing learners get a session; new numbers get a registration token. */
  @Post('otp/verify')
  @HttpCode(200)
  @ApiOkResponse({ type: OtpVerifyResultDto })
  async verifyOtp(@Body() dto: OtpVerifyDto): Promise<OtpVerifyResultDto> {
    const phone = await this.otp.verify(dto.phone, dto.code);
    const result = await this.accounts.signIn(phone, dto.device);
    return result.status === 'authenticated'
      ? { status: result.status, tokens: result.tokens, user: toSummary(result.user) }
      : result;
  }

  /** FR-104: create the account together with the learner's consent and chosen language. */
  @Post('register')
  @HttpCode(201)
  @ApiOkResponse({ type: SessionDto })
  async register(@Body() dto: RegisterDto): Promise<SessionDto> {
    const { tokens, user } = await this.accounts.register(dto);
    return { tokens, user: toSummary(user) };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: TokensDto })
  refresh(@Body() dto: RefreshDto): Promise<TokensDto> {
    return this.tokens.rotate(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.tokens.revoke(dto.refreshToken);
  }
}

export function toSummary(user: User): UserSummaryDto {
  return {
    id: user.id,
    role: user.role,
    uiLocale: user.uiLocale,
    onboarding: { profileComplete: user.firstName !== null },
  };
}
