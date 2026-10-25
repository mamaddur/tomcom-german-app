import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma.service.js';

export interface AuditEvent {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  /** `success`, or `failure:<error code>` */
  outcome: string;
  /** IDs and outcomes only — never request bodies, names, phones or other PII. */
  details?: Record<string, unknown>;
  ip?: string;
}

/** Append-only record of staff actions (FR-909, NFR-11). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.db.auditLog.create({
        data: {
          actorId: event.actorId ?? null,
          actorRole: event.actorRole ?? null,
          action: event.action,
          entityType: event.entityType ?? null,
          entityId: event.entityId ?? null,
          outcome: event.outcome,
          details: (event.details ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          ipHash: event.ip
            ? createHash('sha256').update(event.ip).digest('base64url').slice(0, 22)
            : null,
        },
      });
    } catch (err) {
      // An audit write must never be lost silently; it must also never break the response.
      this.logger.error({ err, action: event.action }, 'audit write failed');
    }
  }
}
