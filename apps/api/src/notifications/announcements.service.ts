import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service.js';

export interface Announcement {
  id: string;
  title: Record<string, string>;
  body: Record<string, string>;
  startsAt: Date;
  endsAt: Date | null;
}

/** FR-205. Announcements a learner should see now: for everyone, or for their current batch. */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async activeFor(learnerId: string, now = new Date()): Promise<Announcement[]> {
    const enrolment = await this.prisma.db.enrolment.findFirst({
      where: { learnerId, leftAt: null },
      select: { batchId: true },
    });
    const rows = await this.prisma.db.announcement.findMany({
      where: {
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        AND: [{ OR: [{ batchId: null }, ...(enrolment ? [{ batchId: enrolment.batchId }] : [])] }],
      },
      orderBy: { startsAt: 'desc' },
      take: 5,
      select: { id: true, title: true, body: true, startsAt: true, endsAt: true },
    });
    return rows.map((r) => ({
      ...r,
      title: r.title as Record<string, string>,
      body: r.body as Record<string, string>,
    }));
  }
}
