import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiError } from '../common/api-error.js';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import {
  BatchDto,
  BatchLearnerDto,
  CreateBatchDto,
  ImportResultDto,
  TrainerDto,
  UpdateBatchDto,
} from './batches.dto.js';
import { BatchesService } from './batches.service.js';
import { MAX_ROSTER_BYTES } from './roster.js';

/** FR-901, FR-908. Trainers read their own batches; TOMCOM admins manage all of them. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('trainer', 'tomcom_admin', 'super_admin')
@Controller('admin')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get('batches')
  @ApiOkResponse({ type: [BatchDto] })
  list(@Auth() auth: AccessClaims): Promise<BatchDto[]> {
    return this.batches.list(auth);
  }

  @Get('batches/:id')
  @ApiOkResponse({ type: BatchDto })
  get(@Auth() auth: AccessClaims, @Param('id', ParseUUIDPipe) id: string): Promise<BatchDto> {
    return this.batches.get(auth, id);
  }

  @Get('batches/:id/learners')
  @ApiOkResponse({ type: [BatchLearnerDto] })
  learners(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BatchLearnerDto[]> {
    return this.batches.learners(auth, id);
  }

  @Get('trainers')
  @Roles('tomcom_admin', 'super_admin')
  @ApiOkResponse({ type: [TrainerDto] })
  trainers(): Promise<TrainerDto[]> {
    return this.batches.trainers();
  }

  @Post('batches')
  @Roles('tomcom_admin', 'super_admin')
  @ApiOkResponse({ type: BatchDto })
  create(
    @Auth() auth: AccessClaims,
    @Body() dto: CreateBatchDto,
    @Ip() ip: string,
  ): Promise<BatchDto> {
    return this.batches.create(auth, dto, ip);
  }

  @Patch('batches/:id')
  @Roles('tomcom_admin', 'super_admin')
  @ApiOkResponse({ type: BatchDto })
  update(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBatchDto,
    @Ip() ip: string,
  ): Promise<BatchDto> {
    return this.batches.update(auth, id, dto, ip);
  }

  /** FR-901: upload a CSV or Excel list of phone numbers. */
  @Post('batches/:id/import')
  @HttpCode(200)
  @Roles('tomcom_admin', 'super_admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ROSTER_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: ImportResultDto })
  import(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Ip() ip: string,
  ): Promise<ImportResultDto> {
    if (!file) throw new ApiError(400, 'file_required');
    return this.batches.importRoster(auth, id, file, ip);
  }
}
