import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './auth.guard.js';
import { ConsentService } from './consent.service.js';
import { ConsentNoticeDto, ConsentNoticeQueryDto } from './dto/consent.dto.js';

interface NoticeBody {
  title: string;
  text: string;
  purposes: Record<string, string>;
}

@ApiTags('consent')
@Controller('consent')
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  /** FR-104, NFR-13: the notice shown before registration, in the learner's language. */
  @Public()
  @Get('notice')
  @ApiOkResponse({ type: ConsentNoticeDto })
  async notice(@Query() query: ConsentNoticeQueryDto): Promise<ConsentNoticeDto> {
    const notice = await this.consent.current();
    const bodies = notice.body as unknown as Record<string, NoticeBody>;
    const locale = query.locale && bodies[query.locale] ? query.locale : 'en';
    const body = bodies[locale]!;
    return {
      version: notice.version,
      locale,
      title: body.title,
      text: body.text,
      purposes: [
        ...notice.requiredPurposes.map((id) => ({
          id,
          required: true,
          label: body.purposes[id] ?? id,
        })),
        ...notice.optionalPurposes.map((id) => ({
          id,
          required: false,
          label: body.purposes[id] ?? id,
        })),
      ],
    };
  }
}
