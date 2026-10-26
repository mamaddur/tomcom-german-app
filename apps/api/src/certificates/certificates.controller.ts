import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import type { Response } from 'express';
import { ApiError } from '../common/api-error.js';
import { RateLimiterService } from '../common/rate-limiter.service.js';
import { Auth, Public, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { CertificatesService } from './certificates.service.js';

export class CertificateDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'TC-7K2M9QX4PA' }) code!: string;
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] }) level!: string;
  @ApiProperty({ nullable: true, type: String }) holderName!: string | null;
  @ApiProperty() score!: number;
  @ApiProperty() issuedAt!: Date;
  @ApiProperty({ enum: ['valid', 'revoked'] }) status!: string;
  @ApiProperty({ nullable: true, type: Date }) revokedAt!: Date | null;
  @ApiProperty() verifyUrl!: string;
}

export class VerifyDto {
  @ApiProperty() code!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Null once the holder erased their account',
  })
  holderName!: string | null;
  @ApiProperty() level!: string;
  @ApiProperty() issuedAt!: Date;
  @ApiProperty() score!: number;
  @ApiProperty({ enum: ['valid', 'revoked'] }) status!: string;
  @ApiProperty({ nullable: true, type: Date }) revokedAt!: Date | null;
  @ApiProperty({ description: 'FR-705: course completion, not an official exam result' })
  statement!: Record<string, string>;
}

export class RevokeDto {
  @ApiProperty({ example: 'Issued to the wrong learner' })
  @IsString()
  @Length(5, 300)
  reason!: string;
}

// Public lookups are cheap, but nobody needs thousands an hour from one address.
const VERIFY_LIMIT = { name: 'certificate-verify', max: 120, windowSeconds: 3600 };
const CODE = /^TC-[0-9A-HJKMNP-TV-Z]{10}$/i;

/** FR-701, FR-702: a learner's own certificates. */
@ApiTags('me')
@ApiBearerAuth()
@Roles('learner')
@Controller('me/certificates')
export class MyCertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get()
  @ApiOkResponse({ type: [CertificateDto] })
  list(@Auth() auth: AccessClaims) {
    return this.certificates.mine(auth.userId);
  }

  @Get(':id/pdf')
  @ApiOkResponse({ description: 'The certificate as PDF' })
  async pdf(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { file, code } = await this.certificates.pdf(auth.userId, id);
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="tomcom-certificate-${code}.pdf"`,
        'Cache-Control': 'no-store',
      })
      .send(file);
  }
}

/** FR-703: the public verification behind the QR code. No login, no personal data beyond the certificate. */
@ApiTags('public')
@Controller('certificates')
export class VerifyController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly limiter: RateLimiterService,
  ) {}

  @Public()
  @Get(':code')
  @ApiOkResponse({ type: VerifyDto })
  async verify(@Param('code') code: string, @Ip() ip: string) {
    await this.limiter.hit(VERIFY_LIMIT, ip);
    if (!CODE.test(code)) throw new ApiError(404, 'certificate_not_found');
    return this.certificates.verify(code);
  }
}

/** FR-704: admins revoke; trainers and admins list certificates in their scope. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('trainer', 'tomcom_admin', 'super_admin')
@Controller('admin/certificates')
export class AdminCertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get()
  @ApiOkResponse({ type: [CertificateDto] })
  list(@Auth() auth: AccessClaims) {
    return this.certificates.list(auth);
  }

  @Post(':id/revoke')
  @HttpCode(204)
  @Roles('tomcom_admin', 'super_admin')
  async revoke(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeDto,
    @Ip() ip: string,
  ): Promise<void> {
    await this.certificates.revoke(auth, id, dto.reason, ip);
  }
}
