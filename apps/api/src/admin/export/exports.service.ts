import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AuditService } from '../../audit/audit.service.js';
import type { AccessClaims } from '../../identity/token.service.js';
import { PrismaService } from '../../infra/prisma.service.js';
import type { LearnerRowDto, OverviewDto, ReportFilterDto } from '../reports.dto.js';
import { ReportsService } from '../reports.service.js';
import { createPdf, table, toBuffer, write } from './pdf.js';

/** Column and heading labels per locale (exports are read by staff in either language). */
const EN = {
  title: 'TOMCOM German learning report',
  range: 'Period (IST)',
  filters: 'Filters',
  none: 'none',
  generated: 'Generated',
  summary: 'Summary',
  learners: 'Learners',
  active: 'Active learners',
  minutes: 'Minutes learned',
  attempts: 'Quiz attempts',
  average: 'Average quiz score',
  completions: 'Completed levels',
  level: 'Level',
  lessons: 'Published lessons',
  completed: 'Learners who passed every lesson',
  byLesson: 'By lesson',
  lesson: 'Lesson',
  attempted: 'Tried the quiz',
  passed: 'Passed',
  averageBest: 'Average best score',
  dropOff: 'Stopped here',
  name: 'Name',
  batch: 'Batch',
  district: 'District',
  trade: 'Trade',
  lessonsPassed: 'Lessons passed',
  lastActive: 'Last active',
  readiness: 'Ready for the exam',
  score: 'Checkpoint score',
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  passedOn: 'Passed on',
};
type Labels = Record<keyof typeof EN, string>;
const LABELS: Record<'en' | 'te', Labels> = {
  en: EN,
  te: {
    title: 'TOMCOM జర్మన్ అభ్యాస నివేదిక',
    range: 'కాలం (IST)',
    filters: 'ఫిల్టర్లు',
    none: 'ఏవీ లేవు',
    generated: 'తయారైన తేదీ',
    summary: 'సారాంశం',
    learners: 'అభ్యాసకులు',
    active: 'క్రియాశీల అభ్యాసకులు',
    minutes: 'నేర్చుకున్న నిమిషాలు',
    attempts: 'క్విజ్ ప్రయత్నాలు',
    average: 'సగటు క్విజ్ స్కోరు',
    completions: 'పూర్తయిన స్థాయిలు',
    level: 'స్థాయి',
    lessons: 'ప్రచురించిన పాఠాలు',
    completed: 'అన్ని పాఠాలు పాసైనవారు',
    byLesson: 'పాఠం వారీగా',
    lesson: 'పాఠం',
    attempted: 'క్విజ్ ప్రయత్నించినవారు',
    passed: 'పాస్',
    averageBest: 'సగటు ఉత్తమ స్కోరు',
    dropOff: 'ఇక్కడ ఆగిపోయినవారు',
    name: 'పేరు',
    batch: 'బ్యాచ్',
    district: 'జిల్లా',
    trade: 'వృత్తి',
    lessonsPassed: 'పాస్ అయిన పాఠాలు',
    lastActive: 'చివరిసారి క్రియాశీలం',
    readiness: 'పరీక్షకు సిద్ధంగా ఉన్నవారు',
    score: 'చెక్‌పాయింట్ స్కోరు',
    reading: 'చదవడం',
    listening: 'వినడం',
    writing: 'రాయడం',
    passedOn: 'పాస్ అయిన తేదీ',
  },
};

const pct = (v: number | null) => (v === null ? '' : `${Math.round(v * 100)}%`);
const istDateTime = (d: Date | null) =>
  d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '';

interface Report {
  overview: OverviewDto;
  learners: LearnerRowDto[];
  names: { districts: Map<string, string>; trades: Map<string, string>; batch?: string };
  l: Labels;
  locale: 'en' | 'te';
}

/**
 * FR-905: Excel and PDF exports of exactly what the dashboard shows for the same filters
 * (story 6), from the same `ReportsService` calls. Exports hold learner names, so each one
 * is written to the audit log (FR-909).
 */
@Injectable()
export class ExportsService {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async report(
    auth: AccessClaims,
    f: ReportFilterDto,
    locale: 'en' | 'te',
    format: string,
    ip?: string,
  ): Promise<Report> {
    const [overview, learners, districts, trades, batch] = await Promise.all([
      this.reports.overview(auth, f),
      this.reports.learners(auth, f),
      this.prisma.db.district.findMany(),
      this.prisma.db.trade.findMany(),
      f.batchId
        ? this.prisma.db.batch.findUnique({ where: { id: f.batchId }, select: { code: true } })
        : null,
    ]);
    const name = (n: unknown) =>
      (n as Record<string, string>)[locale] ?? (n as Record<string, string>).en ?? '';
    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'report_export',
      outcome: 'success',
      details: { format, filters: { ...f }, learners: learners.length },
      ip,
    });
    return {
      overview,
      learners,
      names: {
        districts: new Map(districts.map((d) => [d.code, name(d.name)])),
        trades: new Map(trades.map((t) => [t.code, name(t.name)])),
        batch: batch?.code,
      },
      l: LABELS[locale],
      locale,
    };
  }

  private filterText(r: Report, f: ReportFilterDto): string {
    const parts = [
      r.names.batch && `${r.l.batch}: ${r.names.batch}`,
      f.districtCode &&
        `${r.l.district}: ${r.names.districts.get(f.districtCode) ?? f.districtCode}`,
      f.tradeCode && `${r.l.trade}: ${r.names.trades.get(f.tradeCode) ?? f.tradeCode}`,
      f.level && `${r.l.level}: ${f.level}`,
      f.trainerId && 'trainer',
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : r.l.none;
  }

  async xlsx(
    auth: AccessClaims,
    f: ReportFilterDto,
    locale: 'en' | 'te',
    ip?: string,
  ): Promise<Buffer> {
    const r = await this.report(auth, f, locale, 'xlsx', ip);
    const { l, overview: o } = r;
    const book = new ExcelJS.Workbook();
    book.creator = 'TOMCOM';

    const summary = book.addWorksheet(l.summary);
    summary.columns = [{ width: 36 }, { width: 24 }];
    summary.addRows([
      [l.title],
      [l.range, `${o.from} – ${o.to}`],
      [l.filters, this.filterText(r, f)],
      [],
      [l.learners, o.learners],
      [l.active, o.activeLearners],
      [l.minutes, o.minutes],
      [l.attempts, o.attempts],
      [l.average, o.averageScore === null ? '' : o.averageScore],
      [],
      [l.completions],
      [l.level, l.lessons, l.completed],
      ...o.completions.map((c) => [c.level, c.lessons, c.completed]),
    ]);
    summary.getRow(1).font = { bold: true, size: 14 };
    summary.getCell('B9').numFmt = '0%';

    const lessons = book.addWorksheet(l.byLesson);
    lessons.columns = [
      { header: l.level, width: 8 },
      { header: '#', width: 5 },
      { header: l.lesson, width: 36 },
      { header: l.attempted, width: 14 },
      { header: l.passed, width: 10 },
      { header: l.averageBest, width: 16, style: { numFmt: '0%' } },
      { header: l.dropOff, width: 14 },
    ];
    for (const x of o.lessons) {
      lessons.addRow([
        x.level,
        x.order,
        x.title[locale] ?? x.title.en,
        x.attempted,
        x.passed,
        x.averageBestScore ?? '',
        x.dropOff,
      ]);
    }

    const people = book.addWorksheet(l.learners);
    people.columns = [
      { header: l.name, width: 28 },
      { header: l.batch, width: 14 },
      { header: l.district, width: 18 },
      { header: l.trade, width: 16 },
      { header: l.lessonsPassed, width: 14 },
      { header: l.averageBest, width: 16, style: { numFmt: '0%' } },
      { header: l.minutes, width: 14 },
      { header: l.lastActive, width: 18 },
    ];
    for (const p of r.learners) {
      people.addRow([
        [p.firstName, p.lastName].filter(Boolean).join(' '),
        p.batchCode ?? '',
        r.names.districts.get(p.districtCode ?? '') ?? '',
        r.names.trades.get(p.tradeCode ?? '') ?? '',
        p.lessonsPassed,
        p.averageScore ?? '',
        p.minutes,
        istDateTime(p.lastSeenAt),
      ]);
    }
    for (const sheet of [lessons, people]) {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }
    return Buffer.from(await book.xlsx.writeBuffer());
  }

  /** FR-907 story 6: the readiness list as Excel, for the same filters as on screen. */
  async readinessXlsx(
    auth: AccessClaims,
    f: ReportFilterDto,
    locale: 'en' | 'te',
    ip?: string,
  ): Promise<Buffer> {
    const [rows, districts, trades] = await Promise.all([
      this.reports.readiness(auth, f),
      this.prisma.db.district.findMany(),
      this.prisma.db.trade.findMany(),
    ]);
    const l = LABELS[locale];
    const name = (n: unknown) =>
      (n as Record<string, string>)[locale] ?? (n as Record<string, string>).en ?? '';
    const d = new Map(districts.map((x) => [x.code, name(x.name)]));
    const t = new Map(trades.map((x) => [x.code, name(x.name)]));
    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'report_export',
      outcome: 'success',
      details: { format: 'readiness_xlsx', filters: { ...f }, learners: rows.length },
      ip,
    });
    const book = new ExcelJS.Workbook();
    book.creator = 'TOMCOM';
    const sheet = book.addWorksheet(l.readiness);
    sheet.columns = [
      { header: l.name, width: 28 },
      { header: l.batch, width: 14 },
      { header: l.district, width: 18 },
      { header: l.trade, width: 16 },
      { header: l.level, width: 8 },
      { header: l.score, width: 16, style: { numFmt: '0%' } },
      { header: l.reading, width: 12, style: { numFmt: '0%' } },
      { header: l.listening, width: 12, style: { numFmt: '0%' } },
      { header: l.writing, width: 12, style: { numFmt: '0%' } },
      { header: l.passedOn, width: 18 },
    ];
    for (const r of rows) {
      sheet.addRow([
        [r.firstName, r.lastName].filter(Boolean).join(' '),
        r.batchCode ?? '',
        d.get(r.districtCode ?? '') ?? '',
        t.get(r.tradeCode ?? '') ?? '',
        r.level,
        r.score,
        r.sectionScores.reading ?? '',
        r.sectionScores.listening ?? '',
        r.sectionScores.writing ?? '',
        istDateTime(r.passedAt),
      ]);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return Buffer.from(await book.xlsx.writeBuffer());
  }

  async pdf(
    auth: AccessClaims,
    f: ReportFilterDto,
    locale: 'en' | 'te',
    ip?: string,
  ): Promise<Buffer> {
    const r = await this.report(auth, f, locale, 'pdf', ip);
    const { l, overview: o } = r;
    const doc = createPdf(l.title);
    write(doc, l.title, { size: 16, bold: true });
    doc.moveDown(0.3);
    write(doc, `${l.range}: ${o.from} – ${o.to}`);
    write(doc, `${l.filters}: ${this.filterText(r, f)}`);
    write(doc, `${l.generated}: ${istDateTime(new Date())}`);
    doc.moveDown();
    write(doc, l.summary, { size: 12, bold: true });
    doc.moveDown(0.3);
    table(
      doc,
      [
        { title: '', width: 260 },
        { title: '', width: 120 },
      ],
      [
        [l.learners, String(o.learners)],
        [l.active, String(o.activeLearners)],
        [l.minutes, String(o.minutes)],
        [l.attempts, String(o.attempts)],
        [l.average, pct(o.averageScore)],
      ],
    );
    doc.moveDown();
    write(doc, l.completions, { size: 12, bold: true });
    doc.moveDown(0.3);
    table(
      doc,
      [
        { title: l.level, width: 60 },
        { title: l.lessons, width: 140 },
        { title: l.completed, width: 200 },
      ],
      o.completions.map((c) => [c.level, String(c.lessons), String(c.completed)]),
    );
    doc.moveDown();
    write(doc, l.byLesson, { size: 12, bold: true });
    doc.moveDown(0.3);
    table(
      doc,
      [
        { title: l.level, width: 40 },
        { title: l.lesson, width: 170, max: 32 },
        { title: l.attempted, width: 80 },
        { title: l.passed, width: 60 },
        { title: l.averageBest, width: 85 },
        { title: l.dropOff, width: 80 },
      ],
      o.lessons.map((x) => [
        x.level,
        `${x.order}. ${x.title[locale] ?? x.title.en ?? ''}`,
        String(x.attempted),
        String(x.passed),
        pct(x.averageBestScore),
        String(x.dropOff),
      ]),
    );
    doc.addPage();
    write(doc, `${l.learners} (${r.learners.length})`, { size: 12, bold: true });
    doc.moveDown(0.3);
    table(
      doc,
      [
        { title: l.name, width: 130, max: 26 },
        { title: l.batch, width: 70, max: 12 },
        { title: l.district, width: 85, max: 16 },
        { title: l.trade, width: 70, max: 14 },
        { title: l.lessonsPassed, width: 60 },
        { title: l.averageBest, width: 50 },
        { title: l.minutes, width: 50 },
      ],
      r.learners.map((p) => [
        [p.firstName, p.lastName].filter(Boolean).join(' '),
        p.batchCode ?? '',
        r.names.districts.get(p.districtCode ?? '') ?? '',
        r.names.trades.get(p.tradeCode ?? '') ?? '',
        String(p.lessonsPassed),
        pct(p.averageScore),
        String(p.minutes),
      ]),
    );
    return toBuffer(doc);
  }
}
