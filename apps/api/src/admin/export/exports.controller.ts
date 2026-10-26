import { Controller, Get, Ip, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { Auth, Roles } from '../../identity/auth.guard.js';
import type { AccessClaims } from '../../identity/token.service.js';
import { ReportFilterDto } from '../reports.dto.js';
import { ExportsService } from './exports.service.js';

export class ExportQueryDto extends ReportFilterDto {
  @ApiPropertyOptional({ enum: ['en', 'te'], default: 'en' })
  @IsOptional()
  @IsIn(['en', 'te'])
  locale?: 'en' | 'te';
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** FR-905: the dashboard and learner list as Excel or PDF, for the same filters (story 6). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('trainer', 'tomcom_admin', 'super_admin')
@Controller('admin/reports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('export.xlsx')
  @ApiOkResponse({ description: 'Excel workbook: summary, by lesson, learners' })
  async xlsx(
    @Auth() auth: AccessClaims,
    @Query() q: ExportQueryDto,
    @Ip() ip: string,
    @Res() res: Response,
  ): Promise<void> {
    const { locale, ...f } = q;
    const file = await this.exports.xlsx(auth, f, locale ?? 'en', ip);
    send(res, file, XLSX, 'xlsx');
  }

  @Get('export.pdf')
  @ApiOkResponse({ description: 'PDF report: summary, by lesson, learners' })
  async pdf(
    @Auth() auth: AccessClaims,
    @Query() q: ExportQueryDto,
    @Ip() ip: string,
    @Res() res: Response,
  ): Promise<void> {
    const { locale, ...f } = q;
    const file = await this.exports.pdf(auth, f, locale ?? 'en', ip);
    send(res, file, 'application/pdf', 'pdf');
  }
}

function send(res: Response, file: Buffer, type: string, ext: string) {
  const date = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  res
    .status(200)
    .set({
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="tomcom-report-${date}.${ext}"`,
      'Cache-Control': 'no-store',
    })
    .send(file);
}
