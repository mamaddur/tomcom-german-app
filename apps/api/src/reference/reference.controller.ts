import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from '../identity/auth.guard.js';
import { PrismaService } from '../infra/prisma.service.js';

export class ReferenceItemDto {
  @ApiProperty({ example: 'warangal' }) code!: string;
  @ApiProperty({ example: { te: 'వరంగల్', en: 'Warangal' }, description: 'Name keyed by locale' })
  name!: Record<string, string>;
}

/** Lists for the profile screen (FR-103). Public and cacheable: they hold no personal data. */
@ApiTags('reference')
@Public()
@Controller('reference')
export class ReferenceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('districts')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOkResponse({ type: [ReferenceItemDto] })
  async districts(): Promise<ReferenceItemDto[]> {
    const rows = await this.prisma.db.district.findMany({ orderBy: { order: 'asc' } });
    return rows.map((r) => ({ code: r.code, name: r.name as Record<string, string> }));
  }

  @Get('trades')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOkResponse({ type: [ReferenceItemDto] })
  async trades(): Promise<ReferenceItemDto[]> {
    const rows = await this.prisma.db.trade.findMany({ orderBy: { order: 'asc' } });
    return rows.map((r) => ({ code: r.code, name: r.name as Record<string, string> }));
  }
}
