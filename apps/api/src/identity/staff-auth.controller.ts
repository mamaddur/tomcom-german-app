import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../infra/prisma.service.js';
import { toSummary } from './auth.controller.js';
import { Public } from './auth.guard.js';
import { SessionDto } from './dto/auth.dto.js';
import { StaffChallengeDto, StaffLoginDto, StaffVerifyDto } from './dto/staff-auth.dto.js';
import { StaffAuthService } from './staff-auth.service.js';

/** NFR-10: admin portal and content studio sign-in (password + OTP). */
@ApiTags('staff-auth')
@Public()
@Controller('staff-auth')
export class StaffAuthController {
  constructor(
    private readonly staff: StaffAuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: StaffChallengeDto })
  login(@Body() dto: StaffLoginDto, @Ip() ip: string): Promise<StaffChallengeDto> {
    return this.staff.login(dto.phone, dto.password, ip);
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionDto })
  async verify(@Body() dto: StaffVerifyDto, @Ip() ip: string): Promise<SessionDto> {
    const { tokens, userId } = await this.staff.verify(
      dto.challengeToken,
      dto.code,
      dto.device,
      ip,
    );
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });
    return { tokens, user: toSummary(user) };
  }
}
