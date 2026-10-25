import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiError } from '../common/api-error.js';
import type { MediaAsset } from '../generated/prisma/client.js';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { MAX_UPLOAD_BYTES, MediaService } from './media.service.js';

export class MediaDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['audio', 'image', 'video'] }) type!: string;
  @ApiProperty({ example: 'audio/ogg' }) mime!: string;
  @ApiProperty() bytes!: number;
  @ApiProperty() sha256!: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) durationMs!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) width!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty() createdAt!: Date;
}

const toDto = ({ storageKey: _key, createdBy: _by, ...m }: MediaAsset): MediaDto => m;

/** FR-1002: authors upload recordings and pictures; the API converts them for mobile. */
@ApiTags('studio')
@ApiBearerAuth()
@Roles('author', 'reviewer', 'super_admin')
@Controller('studio/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @Roles('author')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: MediaDto })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Auth() auth: AccessClaims,
  ): Promise<MediaDto> {
    if (!file) throw new ApiError(400, 'file_required');
    return toDto(await this.media.upload(file.buffer, auth));
  }

  @Get(':id')
  @ApiOkResponse({ type: MediaDto })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<MediaDto> {
    return toDto(await this.media.get(id));
  }

  /** Preview in the studio. Learners get media inside lesson packs, never from here. */
  @Get(':id/content')
  async content(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { asset, body } = await this.media.content(id);
    res.setHeader('Content-Type', asset.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(body);
  }
}
