import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth, Roles } from '../identity/auth.guard.js';
import type { AccessClaims } from '../identity/token.service.js';
import { LearnerDetailDto, LearnerRowDto, OverviewDto, ReportFilterDto } from './reports.dto.js';
import { ReportsService } from './reports.service.js';

/** FR-902–FR-904, scoped per FR-908. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('trainer', 'tomcom_admin', 'super_admin')
@Controller('admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reports/overview')
  @ApiOkResponse({ type: OverviewDto })
  overview(@Auth() auth: AccessClaims, @Query() f: ReportFilterDto): Promise<OverviewDto> {
    return this.reports.overview(auth, f);
  }

  @Get('learners')
  @ApiOkResponse({ type: [LearnerRowDto] })
  learners(@Auth() auth: AccessClaims, @Query() f: ReportFilterDto): Promise<LearnerRowDto[]> {
    return this.reports.learners(auth, f);
  }

  @Get('learners/:id')
  @ApiOkResponse({ type: LearnerDetailDto })
  learner(
    @Auth() auth: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LearnerDetailDto> {
    return this.reports.learner(auth, id);
  }
}
