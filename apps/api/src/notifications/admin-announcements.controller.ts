import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { AuditService } from '../audit/audit.service.js';
import { batchScope } from '../admin/scope.js';
import { ApiError } from '../common/api-error.js';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';

/** Both languages are required: learners read banners in Telugu or English (BR-02). */
export class AnnouncementTextDto {
  @ApiProperty() @IsString() @Length(1, 300) te!: string;
  @ApiProperty() @IsString() @Length(1, 300) en!: string;
}

export class CreateAnnouncementDto {
  @ApiProperty({ type: AnnouncementTextDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AnnouncementTextDto)
  title!: AnnouncementTextDto;
  @ApiProperty({ type: AnnouncementTextDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AnnouncementTextDto)
  body!: AnnouncementTextDto;
  @ApiPropertyOptional({ description: 'Leave out for every learner (admins only)' })
  @IsOptional()
  @IsUUID()
  batchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
}

export class AdminAnnouncementDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: Record<string, string>;
  @ApiProperty() body!: Record<string, string>;
  @ApiPropertyOptional({ nullable: true, type: String }) batchCode!: string | null;
  @ApiProperty() startsAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: Date }) endsAt!: Date | null;
  @ApiProperty() active!: boolean;
}

/**
 * FR-906: admins announce to everyone or a batch; trainers to their own batches (FR-908).
 * Push notifications join when the push provider is connected (FR-803, step 8).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('trainer', 'tomcom_admin', 'super_admin')
@Controller('admin/announcements')
export class AdminAnnouncementsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [AdminAnnouncementDto] })
  async list(@Auth() auth: AccessClaims): Promise<AdminAnnouncementDto[]> {
    const scope = await batchScope(this.prisma, auth);
    const now = new Date();
    const rows = await this.prisma.db.announcement.findMany({
      where: scope ? { batchId: { in: scope } } : {},
      orderBy: { startsAt: 'desc' },
      take: 100,
      include: { batch: { select: { code: true } } },
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title as Record<string, string>,
      body: a.body as Record<string, string>,
      batchCode: a.batch?.code ?? null,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      active: a.startsAt <= now && (a.endsAt === null || a.endsAt > now),
    }));
  }

  @Post()
  @ApiOkResponse({ type: AdminAnnouncementDto })
  async create(
    @Auth() auth: AccessClaims,
    @Body() dto: CreateAnnouncementDto,
    @Ip() ip: string,
  ): Promise<AdminAnnouncementDto> {
    const scope = await batchScope(this.prisma, auth);
    if (scope && (!dto.batchId || !scope.includes(dto.batchId))) {
      // Trainers may only announce to their own batches.
      throw new ApiError(403, 'batch_not_allowed');
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endsAt && endsAt <= startsAt)
      throw new ApiError(400, 'validation_failed', { field: 'endsAt' });
    if (dto.batchId && !(await this.prisma.db.batch.findUnique({ where: { id: dto.batchId } }))) {
      throw new ApiError(404, 'batch_not_found');
    }
    const a = await this.prisma.db.announcement.create({
      data: {
        title: { te: dto.title.te, en: dto.title.en },
        body: { te: dto.body.te, en: dto.body.en },
        batchId: dto.batchId ?? null,
        startsAt,
        endsAt,
        createdBy: auth.userId,
      },
      include: { batch: { select: { code: true } } },
    });
    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'announcement_create',
      entityType: 'announcement',
      entityId: a.id,
      outcome: 'success',
      details: { batchId: dto.batchId ?? null },
      ip,
    });
    const now = new Date();
    return {
      id: a.id,
      title: a.title as Record<string, string>,
      body: a.body as Record<string, string>,
      batchCode: a.batch?.code ?? null,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      active: a.startsAt <= now && (a.endsAt === null || a.endsAt > now),
    };
  }

  /** Ends an announcement now; it is kept for the record. */
  @Delete(':id')
  @HttpCode(204)
  async end(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<void> {
    const scope = await batchScope(this.prisma, auth);
    const a = await this.prisma.db.announcement.findUnique({ where: { id } });
    if (!a || (scope && (!a.batchId || !scope.includes(a.batchId)))) {
      throw new ApiError(404, 'announcement_not_found');
    }
    await this.prisma.db.announcement.update({ where: { id }, data: { endsAt: new Date() } });
    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'announcement_end',
      entityType: 'announcement',
      entityId: id,
      outcome: 'success',
      ip,
    });
  }
}
