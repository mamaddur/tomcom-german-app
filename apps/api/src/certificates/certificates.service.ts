import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import QRCode from 'qrcode';
import { batchScope } from '../admin/scope.js';
import { createPdf, toBuffer, write } from '../admin/export/pdf.js';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { ENV, type Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';

/** Crockford base32 without I, L, O, U: easy to read aloud and type from paper. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const newCode = () =>
  `TC-${Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

/** FR-705: every certificate and its verify page say what it is, and what it is not. */
export const STATEMENT = {
  en: 'This is a course completion certificate from the TOMCOM German for Work course. It is not an official German exam result (such as Goethe, telc or ÖSD).',
  te: 'ఇది TOMCOM పని కోసం జర్మన్ కోర్సు పూర్తి చేసిన సర్టిఫికెట్. ఇది అధికారిక జర్మన్ పరీక్ష ఫలితం కాదు (Goethe, telc లేదా ÖSD వంటివి).',
};

export interface CertificateView {
  id: string;
  code: string;
  level: string;
  holderName: string | null;
  score: number;
  issuedAt: Date;
  status: 'valid' | 'revoked';
  revokedAt: Date | null;
  verifyUrl: string;
}

type Row = Prisma.CertificateGetPayload<{ include: { level: { select: { code: true } } } }>;

/** FR-701–FR-705: issue on passing, PDF with QR, public verification, revocation. */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private verifyUrl(code: string) {
    return `${this.env.VERIFY_BASE_URL.replace(/\/$/, '')}/${code}`;
  }

  private view(c: Row): CertificateView {
    return {
      id: c.id,
      code: c.code,
      level: c.level.code,
      holderName: c.holderName,
      score: c.score,
      issuedAt: c.issuedAt,
      status: c.revokedAt ? 'revoked' : 'valid',
      revokedAt: c.revokedAt,
      verifyUrl: this.verifyUrl(c.code),
    };
  }

  /**
   * FR-701: issues the level certificate when a checkpoint attempt has passed and every
   * published lesson of the level is passed. One certificate per learner and level; called
   * again, it changes nothing.
   */
  async issueFor(attemptId: string): Promise<void> {
    const a = await this.prisma.db.checkpointAttempt.findUnique({
      where: { id: attemptId },
      include: {
        learner: { select: { firstName: true, lastName: true, status: true } },
        level: {
          select: {
            lessons: { where: { publishedRevision: { not: null } }, select: { id: true } },
          },
        },
      },
    });
    if (!a || a.status !== 'passed' || a.learner.status !== 'active' || a.total === null) return;
    const passed = await this.prisma.db.lessonProgress.count({
      where: {
        learnerId: a.learnerId,
        passed: true,
        lessonId: { in: a.level.lessons.map((l) => l.id) },
      },
    });
    if (passed < a.level.lessons.length) return;
    for (let i = 0; i < 3; i++) {
      try {
        await this.prisma.db.certificate.create({
          data: {
            code: newCode(),
            learnerId: a.learnerId,
            levelId: a.levelId,
            attemptId: a.id,
            holderName: [a.learner.firstName, a.learner.lastName].filter(Boolean).join(' ') || null,
            score: a.total,
          },
        });
        return;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002')
          throw err;
        const target = String((err.meta as { target?: unknown })?.target ?? '');
        // Already certified for this level (or this attempt): nothing to do.
        if (!target.includes('code')) return;
      }
    }
  }

  async mine(learnerId: string): Promise<CertificateView[]> {
    const rows = await this.prisma.db.certificate.findMany({
      where: { learnerId },
      orderBy: { issuedAt: 'asc' },
      include: { level: { select: { code: true } } },
    });
    return rows.map((r) => this.view(r));
  }

  /** FR-702: the certificate as PDF, in English and Telugu, with a QR code to the verify page. */
  async pdf(learnerId: string, id: string): Promise<{ file: Buffer; code: string }> {
    const c = await this.prisma.db.certificate.findFirst({
      where: { id, learnerId },
      include: { level: { select: { code: true } } },
    });
    if (!c) throw new ApiError(404, 'certificate_not_found');
    if (c.revokedAt) throw new ApiError(409, 'certificate_revoked');
    const url = this.verifyUrl(c.code);
    const qr = await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', margin: 1, width: 300 });
    const date = new Date(c.issuedAt.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const doc = createPdf(`TOMCOM certificate ${c.code}`);
    const width = doc.page.width - 80;
    doc
      .rect(25, 25, doc.page.width - 50, doc.page.height - 50)
      .lineWidth(2)
      .strokeColor('#1f5fbf')
      .stroke();
    doc.moveDown(2);
    write(doc, 'TOMCOM · German for Work', { size: 14, bold: true });
    write(doc, 'పని కోసం జర్మన్', { size: 12 });
    doc.moveDown(1.5);
    write(doc, 'Certificate of Course Completion', { size: 24, bold: true });
    write(doc, 'కోర్సు పూర్తి చేసిన సర్టిఫికెట్', { size: 18, bold: true });
    doc.moveDown(1.5);
    write(doc, 'This certifies that / ఈ సర్టిఫికెట్ ద్వారా ధృవీకరించేది', { size: 11 });
    doc.moveDown(0.5);
    write(doc, c.holderName ?? '—', { size: 22, bold: true });
    doc.moveDown(0.5);
    write(
      doc,
      `has completed German level ${c.level.code} of the course, with a checkpoint score of ${Math.round(c.score * 100)}%.`,
      {
        size: 12,
        width,
      },
    );
    write(
      doc,
      `కోర్సులో జర్మన్ ${c.level.code} స్థాయిని ${Math.round(c.score * 100)}% చెక్‌పాయింట్ స్కోరుతో పూర్తి చేశారు.`,
      {
        size: 12,
        width,
      },
    );
    doc.moveDown();
    write(doc, `Date / తేదీ: ${date}`, { size: 11 });
    write(doc, `Certificate ID / సర్టిఫికెట్ ID: ${c.code}`, { size: 11, bold: true });
    doc.moveDown();
    const qrY = doc.y;
    doc.image(qr, 40, qrY, { width: 110 });
    write(doc, 'Scan to verify / ధృవీకరించడానికి స్కాన్ చేయండి', {
      x: 165,
      y: qrY + 20,
      width: width - 130,
      size: 10,
    });
    write(doc, url, { x: 165, y: qrY + 40, width: width - 130, size: 9 });
    doc.y = qrY + 130;
    doc.x = 40;
    write(doc, STATEMENT.en, { size: 9, width });
    write(doc, STATEMENT.te, { size: 9, width });
    return { file: await toBuffer(doc), code: c.code };
  }

  /** FR-703: what anyone scanning the QR code may see. */
  async verify(code: string) {
    const c = await this.prisma.db.certificate.findUnique({
      where: { code: code.toUpperCase() },
      include: { level: { select: { code: true } } },
    });
    if (!c) throw new ApiError(404, 'certificate_not_found');
    const v = this.view(c);
    return {
      code: v.code,
      holderName: v.holderName,
      level: v.level,
      issuedAt: v.issuedAt,
      score: v.score,
      status: v.status,
      revokedAt: v.revokedAt,
      statement: STATEMENT,
    };
  }

  /** Certificates of learners in the staff member's scope (FR-908), newest first. */
  async list(auth: AccessClaims) {
    const scope = await batchScope(this.prisma, auth);
    const rows = await this.prisma.db.certificate.findMany({
      where: scope
        ? { learner: { enrolments: { some: { leftAt: null, batchId: { in: scope } } } } }
        : {},
      orderBy: { issuedAt: 'desc' },
      take: 500,
      include: {
        level: { select: { code: true } },
        learner: {
          select: {
            enrolments: { where: { leftAt: null }, select: { batch: { select: { code: true } } } },
          },
        },
      },
    });
    return rows.map((r) => ({
      ...this.view(r),
      batchCode: r.learner.enrolments[0]?.batch.code ?? null,
      revokeReason: r.revokeReason,
    }));
  }

  /** FR-704: an admin withdraws a certificate with a reason; the verify page then says so. */
  async revoke(auth: AccessClaims, id: string, reason: string, ip?: string) {
    const updated = await this.prisma.db.certificate.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: auth.userId, revokeReason: reason },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.db.certificate.count({ where: { id } });
      throw new ApiError(exists ? 409 : 404, exists ? 'already_revoked' : 'certificate_not_found');
    }
    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'certificate_revoke',
      entityType: 'certificate',
      entityId: id,
      outcome: 'success',
      ip,
    });
  }
}
