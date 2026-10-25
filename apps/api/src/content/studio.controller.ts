import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiError } from '../common/api-error.js';
import type { ContentStatus, LevelCode } from '../generated/prisma/client.js';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import {
  CommentDto,
  CreateLessonDto,
  LessonDetailDto,
  LessonOrderDto,
  LessonSummaryDto,
  LevelDto,
  RevisionDto,
  RollbackDto,
  TransitionDto,
  UpdateLessonDto,
  VocabDto,
  VocabInputDto,
  VocabQueryDto,
} from './dto/studio.dto.js';
import { StudioService } from './studio.service.js';
import { VocabService } from './vocab.service.js';

const LEVELS = ['A1', 'A2', 'B1'];
const STATUSES = ['draft', 'in_review', 'approved', 'published'];

/** Content studio API (FR-1001, FR-1003, FR-1005). Authors write; reviewers review; both read. */
@ApiTags('studio')
@ApiBearerAuth()
@Roles('author', 'reviewer', 'super_admin')
@Controller('studio')
export class StudioController {
  constructor(
    private readonly studio: StudioService,
    private readonly vocab: VocabService,
  ) {}

  @Get('levels')
  @ApiOkResponse({ type: [LevelDto] })
  levels(): Promise<LevelDto[]> {
    return this.studio.levels();
  }

  @Get('lessons')
  @ApiQuery({ name: 'level', required: false, enum: LEVELS })
  @ApiQuery({ name: 'status', required: false, enum: STATUSES })
  @ApiOkResponse({ type: [LessonSummaryDto] })
  list(
    @Query('level') level?: string,
    @Query('status') status?: string,
  ): Promise<LessonSummaryDto[]> {
    if (level && !LEVELS.includes(level))
      throw new ApiError(400, 'validation_failed', {
        fields: [{ field: 'level', rules: ['isIn'] }],
      });
    if (status && !STATUSES.includes(status))
      throw new ApiError(400, 'validation_failed', {
        fields: [{ field: 'status', rules: ['isIn'] }],
      });
    return this.studio.list(level as LevelCode | undefined, status as ContentStatus | undefined);
  }

  @Post('lessons')
  @Roles('author')
  @ApiOkResponse({ type: LessonDetailDto })
  create(@Body() dto: CreateLessonDto, @Auth() auth: AccessClaims): Promise<LessonDetailDto> {
    return this.studio.create(dto.level, dto.title, auth);
  }

  @Get('lessons/:id')
  @ApiOkResponse({ type: LessonDetailDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<LessonDetailDto> {
    return this.studio.get(id);
  }

  @Put('lessons/:id')
  @Roles('author')
  @ApiOkResponse({ type: LessonDetailDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLessonDto,
    @Auth() auth: AccessClaims,
  ): Promise<LessonDetailDto> {
    return this.studio.update(id, dto, auth);
  }

  @Post('lessons/:id/transition')
  @HttpCode(200)
  @Roles('author', 'reviewer')
  @ApiOkResponse({ type: LessonDetailDto })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
    @Auth() auth: AccessClaims,
  ): Promise<LessonDetailDto> {
    return this.studio.transition(id, dto, auth);
  }

  @Post('lessons/:id/comments')
  @Roles('author', 'reviewer')
  @ApiOkResponse({ type: LessonDetailDto })
  comment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentDto,
    @Auth() auth: AccessClaims,
  ): Promise<LessonDetailDto> {
    return this.studio.comment(id, dto.body, auth);
  }

  @Get('lessons/:id/revisions')
  @ApiOkResponse({ type: [RevisionDto] })
  revisions(@Param('id', ParseUUIDPipe) id: string): Promise<RevisionDto[]> {
    return this.studio.revisions(id);
  }

  @Post('lessons/:id/rollback')
  @HttpCode(200)
  @Roles('author')
  @ApiOkResponse({ type: LessonDetailDto })
  rollback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RollbackDto,
    @Auth() auth: AccessClaims,
  ): Promise<LessonDetailDto> {
    return this.studio.rollback(id, dto.revision, auth);
  }

  @Put('levels/:level/lesson-order')
  @Roles('author')
  @ApiOkResponse({ type: [LessonSummaryDto] })
  reorder(@Param('level') level: string, @Body() dto: LessonOrderDto): Promise<LessonSummaryDto[]> {
    if (!LEVELS.includes(level)) throw new ApiError(404, 'level_not_found');
    return this.studio.reorder(level as LevelCode, dto.lessonIds);
  }

  @Get('vocab')
  @ApiOkResponse({ type: [VocabDto] })
  searchVocab(@Query() query: VocabQueryDto): Promise<VocabDto[]> {
    return this.vocab.search(query.q);
  }

  @Get('vocab/:id')
  @ApiOkResponse({ type: VocabDto })
  getVocab(@Param('id', ParseUUIDPipe) id: string): Promise<VocabDto> {
    return this.vocab.get(id);
  }

  @Post('vocab')
  @Roles('author')
  @ApiOkResponse({ type: VocabDto })
  createVocab(@Body() dto: VocabInputDto, @Auth() auth: AccessClaims): Promise<VocabDto> {
    return this.vocab.create(dto, auth);
  }

  @Put('vocab/:id')
  @Roles('author')
  @ApiOkResponse({ type: VocabDto })
  updateVocab(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VocabInputDto,
    @Auth() auth: AccessClaims,
  ): Promise<VocabDto> {
    return this.vocab.update(id, dto, auth);
  }
}
