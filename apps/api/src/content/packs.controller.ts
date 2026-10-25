import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiError } from '../common/api-error.js';
import type { LevelCode } from '../generated/prisma/client.js';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PackService } from './pack.service.js';

export class PackDto {
  @ApiProperty({ enum: ['A1', 'A2', 'B1'] }) level!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ description: 'Size of the zip download' }) bytes!: number;
  @ApiProperty({ description: 'SHA-256 of the zip, to verify the download' }) sha256!: string;
  @ApiProperty() lessonCount!: number;
  @ApiProperty() publishedAt!: Date;
}

export class PublishResultDto {
  @ApiProperty({ type: PackDto }) pack!: PackDto;
  @ApiProperty({ type: [String], description: 'Lessons left out because they were never approved' })
  skippedLessonIds!: string[];
}

const LEVELS = ['A1', 'A2', 'B1'];
function level(value: string): LevelCode {
  if (!LEVELS.includes(value)) throw new ApiError(404, 'level_not_found');
  return value as LevelCode;
}

/** FR-1004: reviewers publish a level; learners download the pack (FR-307). */
@ApiTags('packs')
@ApiBearerAuth()
@Controller()
export class PacksController {
  constructor(private readonly packs: PackService) {}

  @Post('studio/levels/:level/publish')
  @HttpCode(200)
  @Roles('reviewer')
  @ApiOkResponse({ type: PublishResultDto })
  publish(@Param('level') lvl: string, @Auth() auth: AccessClaims): Promise<PublishResultDto> {
    return this.packs.publish(level(lvl), auth);
  }

  @Get('studio/levels/:level/packs')
  @Roles('author', 'reviewer', 'super_admin')
  @ApiOkResponse({ type: [PackDto] })
  history(@Param('level') lvl: string): Promise<PackDto[]> {
    return this.packs.history(level(lvl));
  }

  /** Newest pack per level, for the app's download screen. Any signed-in user. */
  @Get('packs')
  @ApiOkResponse({ type: [PackDto] })
  latest(): Promise<PackDto[]> {
    return this.packs.latest();
  }

  @Get('packs/:level/:version/download')
  async download(
    @Param('level') lvl: string,
    @Param('version', ParseIntPipe) version: number,
    @Res() res: Response,
  ) {
    const { pack, body } = await this.packs.file(level(lvl), version, 'zip');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('ETag', `"${pack.sha256}"`);
    // Versions never change, so phones and the CDN can cache them for good.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(body);
  }

  @Get('packs/:level/:version/manifest')
  async manifest(
    @Param('level') lvl: string,
    @Param('version', ParseIntPipe) version: number,
    @Res() res: Response,
  ) {
    const { body } = await this.packs.file(level(lvl), version, 'manifest');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(body);
  }
}
