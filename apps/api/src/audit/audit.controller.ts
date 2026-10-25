import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Roles } from '../identity/auth.guard.js';
import { PrismaService } from '../infra/prisma.service.js';

export class AuditQueryDto {
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Return entries older than this id (pagination)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  beforeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/)
  actorId?: string;
}

export class AuditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() at!: Date;
  @ApiPropertyOptional({ nullable: true, type: String }) actorId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) actorRole!: string | null;
  @ApiProperty() action!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) entityType!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) entityId!: string | null;
  @ApiProperty() outcome!: string;
  @ApiPropertyOptional({ nullable: true, type: Object }) details!: unknown;
}

/** FR-909: super admins read the audit log, newest first. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/audit-log')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ type: [AuditEntryDto] })
  async list(@Query() q: AuditQueryDto): Promise<AuditEntryDto[]> {
    const rows = await this.prisma.db.auditLog.findMany({
      where: {
        ...(q.beforeId ? { id: { lt: BigInt(q.beforeId) } } : {}),
        ...(q.actorId ? { actorId: q.actorId } : {}),
      },
      orderBy: { id: 'desc' },
      take: q.limit ?? 50,
    });
    return rows.map(({ ipHash: _ip, ...r }) => ({ ...r, id: r.id.toString() }));
  }
}
