import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../infra/prisma.service.js';

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  /** The notice new learners must accept: the highest published version. */
  async current() {
    const notice = await this.prisma.db.consentNotice.findFirst({
      where: { publishedAt: { lte: new Date() } },
      orderBy: { version: 'desc' },
    });
    if (!notice) throw new ApiError(503, 'consent_notice_missing');
    return notice;
  }

  /** Throws unless `purposes` is the current notice's required set plus any of its optional ones. */
  async assertAcceptable(noticeVersion: number, purposes: string[]) {
    const notice = await this.current();
    if (noticeVersion !== notice.version) {
      throw new ApiError(409, 'consent_notice_outdated', { currentVersion: notice.version });
    }
    const allowed = new Set([...notice.requiredPurposes, ...notice.optionalPurposes]);
    const missing = notice.requiredPurposes.filter((p) => !purposes.includes(p));
    const unknown = purposes.filter((p) => !allowed.has(p));
    if (missing.length || unknown.length) {
      throw new ApiError(400, 'consent_purposes_invalid', { missing, unknown });
    }
    return notice;
  }
}
