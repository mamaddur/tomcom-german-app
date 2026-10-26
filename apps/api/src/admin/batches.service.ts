import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { normalizePhone } from '../common/phone.js';
import { PiiCryptoService } from '../common/pii-crypto.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import type {
  BatchDto,
  BatchLearnerDto,
  CreateBatchDto,
  ImportResultDto,
  UpdateBatchDto,
} from './batches.dto.js';
import { readRoster } from './roster.js';
import { batchScope, maskPhone } from './scope.js';

/** Uploaded numbers that never sign up are forgotten after this long. */
const INVITE_DAYS = 90;

const staffName = (u: { firstName: string | null; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ');

/** FR-901 batches and learner lists; FR-908 trainers see only their own batches. */
@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: PiiCryptoService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AccessClaims): Promise<BatchDto[]> {
    const scope = await batchScope(this.prisma, auth);
    const batches = await this.prisma.db.batch.findMany({
      where: scope ? { id: { in: scope } } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        trainers: {
          include: { trainer: { select: { id: true, firstName: true, lastName: true } } },
        },
        _count: {
          select: {
            enrolments: { where: { leftAt: null } },
            invites: { where: { expiresAt: { gt: new Date() } } },
          },
        },
      },
    });
    return batches.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      districtCode: b.districtCode,
      tradeCode: b.tradeCode,
      startDate: b.startDate?.toISOString().slice(0, 10) ?? null,
      status: b.status,
      learnerCount: b._count.enrolments,
      pendingInvites: b._count.invites,
      trainers: b.trainers.map((t) => ({ id: t.trainer.id, name: staffName(t.trainer) })),
    }));
  }

  async get(auth: AccessClaims, id: string): Promise<BatchDto> {
    const batch = (await this.list(auth)).find((b) => b.id === id);
    // Out of scope looks the same as missing (FR-908).
    if (!batch) throw new ApiError(404, 'batch_not_found');
    return batch;
  }

  async trainers(): Promise<Array<{ id: string; name: string }>> {
    const rows = await this.prisma.db.user.findMany({
      where: { role: 'trainer', status: 'active' },
      orderBy: { firstName: 'asc' },
      select: { id: true, firstName: true, lastName: true },
    });
    return rows.map((r) => ({ id: r.id, name: staffName(r) }));
  }

  async create(auth: AccessClaims, dto: CreateBatchDto, ip?: string): Promise<BatchDto> {
    await this.assertTrainers(dto.trainerIds);
    try {
      const batch = await this.prisma.db.batch.create({
        data: {
          code: dto.code,
          name: dto.name,
          districtCode: dto.districtCode ?? null,
          tradeCode: dto.tradeCode ?? null,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          trainers: { create: dto.trainerIds.map((trainerId) => ({ trainerId })) },
        },
      });
      await this.audit.record({
        actorId: auth.userId,
        actorRole: auth.role,
        action: 'batch_create',
        entityType: 'batch',
        entityId: batch.id,
        outcome: 'success',
        details: { code: dto.code, trainers: dto.trainerIds.length },
        ip,
      });
      return this.get(auth, batch.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') throw new ApiError(409, 'batch_code_taken');
        if (err.code === 'P2003') throw new ApiError(400, 'unknown_reference');
      }
      throw err;
    }
  }

  async update(
    auth: AccessClaims,
    id: string,
    dto: UpdateBatchDto,
    ip?: string,
  ): Promise<BatchDto> {
    await this.get(auth, id);
    if (dto.trainerIds) await this.assertTrainers(dto.trainerIds);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.batch.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
      });
      if (dto.trainerIds) {
        await tx.batchTrainer.deleteMany({ where: { batchId: id } });
        await tx.batchTrainer.createMany({
          data: dto.trainerIds.map((trainerId) => ({ batchId: id, trainerId })),
        });
      }
    });
    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'batch_update',
      entityType: 'batch',
      entityId: id,
      outcome: 'success',
      details: { fields: Object.keys(dto) },
      ip,
    });
    return this.get(auth, id);
  }

  async learners(auth: AccessClaims, id: string): Promise<BatchLearnerDto[]> {
    await this.get(auth, id);
    const enrolments = await this.prisma.db.enrolment.findMany({
      where: { batchId: id, leftAt: null },
      orderBy: { enrolledAt: 'asc' },
      include: {
        learner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneEnc: true,
            lastSeenAt: true,
            profile: { select: { districtCode: true, tradeCode: true } },
            _count: { select: { lessonProgress: { where: { passed: true } } } },
          },
        },
      },
    });
    return enrolments.map(({ learner: l, ...e }) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      phone: maskPhone(this.crypto.decrypt(l.phoneEnc)),
      districtCode: l.profile?.districtCode ?? null,
      tradeCode: l.profile?.tradeCode ?? null,
      source: e.source,
      joinedAt: e.enrolledAt,
      lastSeenAt: l.lastSeenAt,
      lessonsPassed: l._count.lessonProgress,
    }));
  }

  /**
   * FR-901 bulk upload. Learners who already use the app move into this batch now; numbers
   * that have not signed up get an invite and join when they register with their own consent.
   */
  async importRoster(
    auth: AccessClaims,
    id: string,
    file: { buffer: Buffer; originalname: string },
    ip?: string,
  ): Promise<ImportResultDto> {
    const batch = await this.get(auth, id);
    if (batch.status !== 'active') throw new ApiError(409, 'batch_closed');
    const rows = await readRoster(file.buffer, file.originalname);

    const invalidRows: number[] = [];
    const phones = new Map<string, string>(); // hmac → e164, first occurrence wins
    let unchanged = 0;
    for (const { row, value } of rows) {
      const e164 = normalizePhone(value);
      if (!e164) {
        invalidRows.push(row);
        continue;
      }
      const hmac = this.crypto.hmac(e164);
      if (phones.has(hmac)) unchanged++;
      else phones.set(hmac, e164);
    }

    const users = await this.prisma.db.user.findMany({
      where: { phoneHmac: { in: [...phones.keys()] } },
      select: {
        id: true,
        phoneHmac: true,
        role: true,
        status: true,
        enrolments: { where: { leftAt: null }, select: { id: true, batchId: true } },
      },
    });
    const byHmac = new Map(users.map((u) => [u.phoneHmac, u]));
    let enrolled = 0;
    let invited = 0;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000);

    await this.prisma.db.$transaction(async (tx) => {
      for (const [hmac, e164] of phones) {
        const user = byHmac.get(hmac);
        if (user && (user.role !== 'learner' || user.status !== 'active')) {
          // A staff number or an erased account: never enrol it.
          unchanged++;
        } else if (user) {
          if (user.enrolments.some((e) => e.batchId === id)) {
            unchanged++;
            continue;
          }
          await tx.enrolment.updateMany({
            where: { learnerId: user.id, leftAt: null },
            data: { leftAt: now },
          });
          await tx.enrolment.create({ data: { learnerId: user.id, batchId: id, source: 'bulk' } });
          enrolled++;
        } else {
          await tx.batchInvite.upsert({
            where: { phoneHmac_batchId: { phoneHmac: hmac, batchId: id } },
            create: {
              batchId: id,
              phoneHmac: hmac,
              phoneEnc: new Uint8Array(this.crypto.encrypt(e164)),
              createdBy: auth.userId,
              expiresAt,
            },
            update: { expiresAt },
          });
          invited++;
        }
      }
    });

    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'batch_import',
      entityType: 'batch',
      entityId: id,
      outcome: 'success',
      details: { rows: rows.length, enrolled, invited, unchanged, invalid: invalidRows.length },
      ip,
    });
    return { enrolled, invited, unchanged, invalidRows };
  }

  private async assertTrainers(ids: string[]) {
    if (ids.length === 0) return;
    const found = await this.prisma.db.user.count({
      where: { id: { in: ids }, role: 'trainer', status: 'active' },
    });
    if (found !== new Set(ids).size) throw new ApiError(400, 'unknown_trainer');
  }
}
