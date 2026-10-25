import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { PiiCryptoService } from '../common/pii-crypto.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import type {
  LearnerDetailDto,
  LearnerRowDto,
  LessonFunnelDto,
  OverviewDto,
  ReportFilterDto,
} from './reports.dto.js';
import { batchScope, maskPhone } from './scope.js';

const DAY_MS = 86_400_000;
const IST_MS = 5.5 * 3600_000;
const istToday = () => new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** Start of an IST day as a UTC instant. */
const istStart = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - IST_MS);

/** A resolved filter: the learner population SQL plus the date range. */
interface Population {
  sql: Prisma.Sql;
  from: string;
  to: string;
  /** Instants bounding the IST days [from, to]. */
  start: Date;
  end: Date;
  level?: string;
}

/**
 * FR-902–FR-904 reports. Every number comes from `population()`, which applies the trainer
 * scope (FR-908) and the filters (FR-903), so the dashboard and its export agree (story 6).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: PiiCryptoService,
  ) {}

  async population(auth: AccessClaims, f: ReportFilterDto): Promise<Population> {
    const to = f.to ?? istToday();
    const from = f.from ?? addDays(to, -29);
    if (from > to) throw new ApiError(400, 'validation_failed', { field: 'from' });
    if (Date.parse(to) - Date.parse(from) > 366 * DAY_MS) {
      throw new ApiError(400, 'range_too_long', { maxDays: 366 });
    }
    const scope = await batchScope(this.prisma, auth);
    const where: Prisma.Sql[] = [Prisma.sql`u.role = 'learner'`, Prisma.sql`u.status = 'active'`];
    if (scope) {
      // A trainer with no batches sees nobody.
      where.push(
        scope.length
          ? Prisma.sql`e.batch_id IN (${Prisma.join(scope.map((id) => Prisma.sql`${id}::uuid`))})`
          : Prisma.sql`false`,
      );
    }
    if (f.batchId) where.push(Prisma.sql`e.batch_id = ${f.batchId}::uuid`);
    if (f.districtCode) where.push(Prisma.sql`p.district_code = ${f.districtCode}`);
    if (f.tradeCode) where.push(Prisma.sql`p.trade_code = ${f.tradeCode}`);
    if (f.trainerId) {
      where.push(Prisma.sql`EXISTS (SELECT 1 FROM batch_trainers bt
        WHERE bt.batch_id = e.batch_id AND bt.trainer_id = ${f.trainerId}::uuid)`);
    }
    const sql = Prisma.sql`
      SELECT u.id AS learner_id, e.batch_id, b.code AS batch_code,
             p.district_code, p.trade_code
      FROM users u
      LEFT JOIN enrolments e ON e.learner_id = u.id AND e.left_at IS NULL
      LEFT JOIN batches b ON b.id = e.batch_id
      LEFT JOIN learner_profiles p ON p.user_id = u.id
      WHERE ${Prisma.join(where, ' AND ')}`;
    return { sql, from, to, start: istStart(from), end: istStart(addDays(to, 1)), level: f.level };
  }

  async overview(auth: AccessClaims, f: ReportFilterDto): Promise<OverviewDto> {
    const pop = await this.population(auth, f);
    const db = this.prisma.db;
    const levelFilter = pop.level ? Prisma.sql`AND lv.code::text = ${pop.level}` : Prisma.empty;

    const [[totals], [activity], [attempts], completions, lessons] = await Promise.all([
      db.$queryRaw<[{ learners: bigint }]>`
        WITH pop AS (${pop.sql}) SELECT count(*) AS learners FROM pop`,
      db.$queryRaw<[{ active: bigint; seconds: bigint | null }]>`
        WITH pop AS (${pop.sql})
        SELECT count(DISTINCT d.learner_id) AS active, sum(d.seconds) AS seconds
        FROM daily_activity d JOIN pop ON pop.learner_id = d.learner_id
        WHERE d.date BETWEEN ${pop.from}::date AND ${pop.to}::date AND d.seconds > 0`,
      db.$queryRaw<[{ attempts: bigint; average: number | null }]>`
        WITH pop AS (${pop.sql})
        SELECT count(*) AS attempts, avg(a.score) AS average
        FROM quiz_attempts a
        JOIN pop ON pop.learner_id = a.learner_id
        JOIN lessons l ON l.id = a.lesson_id JOIN levels lv ON lv.id = l.level_id
        WHERE a.finished_at >= ${pop.start} AND a.finished_at < ${pop.end} ${levelFilter}`,
      db.$queryRaw<Array<{ level: string; lessons: number; completed: bigint }>>`
        WITH pop AS (${pop.sql}),
        published AS (
          SELECT lv.code::text AS level, l.id
          FROM lessons l JOIN levels lv ON lv.id = l.level_id
          WHERE l.published_revision IS NOT NULL ${levelFilter}
        ),
        per_level AS (SELECT level, count(*)::int AS lessons FROM published GROUP BY level),
        passed AS (
          SELECT pub.level, lp.learner_id, count(*)::int AS n
          FROM lesson_progress lp
          JOIN published pub ON pub.id = lp.lesson_id
          JOIN pop ON pop.learner_id = lp.learner_id
          WHERE lp.passed AND lp.passed_at < ${pop.end}
          GROUP BY pub.level, lp.learner_id
        )
        SELECT pl.level, pl.lessons,
               count(pa.learner_id) FILTER (WHERE pa.n = pl.lessons) AS completed
        FROM per_level pl LEFT JOIN passed pa ON pa.level = pl.level
        GROUP BY pl.level, pl.lessons ORDER BY pl.level`,
      db.$queryRaw<
        Array<{
          lesson_id: string;
          level: string;
          order: number;
          title: Record<string, string>;
          attempted: bigint;
          passed: bigint;
          average_best: number | null;
        }>
      >`
        WITH pop AS (${pop.sql})
        SELECT l.id AS lesson_id, lv.code::text AS level, l."order", l.title,
          (SELECT count(DISTINCT a.learner_id) FROM quiz_attempts a
             JOIN pop ON pop.learner_id = a.learner_id
             WHERE a.lesson_id = l.id AND a.finished_at < ${pop.end}) AS attempted,
          (SELECT count(*) FROM lesson_progress lp
             JOIN pop ON pop.learner_id = lp.learner_id
             WHERE lp.lesson_id = l.id AND lp.passed AND lp.passed_at < ${pop.end}) AS passed,
          (SELECT avg(lp.best_score) FROM lesson_progress lp
             JOIN pop ON pop.learner_id = lp.learner_id
             WHERE lp.lesson_id = l.id) AS average_best
        FROM lessons l
        JOIN levels lv ON lv.id = l.level_id
        WHERE l.published_revision IS NOT NULL ${levelFilter}
        ORDER BY lv."order", l."order"`,
    ]);

    // Drop-off: passed the previous lesson in the level, but not this one.
    const funnel: LessonFunnelDto[] = lessons.map((l, i) => {
      const prev = lessons[i - 1];
      const passed = Number(l.passed);
      const reached = prev && prev.level === l.level ? Number(prev.passed) : null;
      return {
        lessonId: l.lesson_id,
        level: l.level,
        order: l.order,
        title: l.title,
        attempted: Number(l.attempted),
        passed,
        averageBestScore: l.average_best === null ? null : Number(l.average_best),
        dropOff: reached === null ? 0 : Math.max(reached - passed, 0),
      };
    });
    return {
      from: pop.from,
      to: pop.to,
      learners: Number(totals.learners),
      activeLearners: Number(activity.active),
      minutes: Math.round(Number(activity.seconds ?? 0) / 60),
      attempts: Number(attempts.attempts),
      averageScore: attempts.average === null ? null : Number(attempts.average),
      completions: completions.map((c) => ({
        level: c.level,
        lessons: c.lessons,
        completed: Number(c.completed),
      })),
      lessons: funnel,
    };
  }

  async learners(auth: AccessClaims, f: ReportFilterDto): Promise<LearnerRowDto[]> {
    const pop = await this.population(auth, f);
    const rows = await this.prisma.db.$queryRaw<
      Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        batch_code: string | null;
        district_code: string | null;
        trade_code: string | null;
        lessons_passed: bigint;
        average_score: number | null;
        seconds: bigint | null;
        last_seen_at: Date | null;
      }>
    >`
      WITH pop AS (${pop.sql})
      SELECT u.id, u.first_name, u.last_name, pop.batch_code, pop.district_code, pop.trade_code,
        (SELECT count(*) FROM lesson_progress lp WHERE lp.learner_id = u.id AND lp.passed) AS lessons_passed,
        (SELECT avg(lp.best_score) FROM lesson_progress lp WHERE lp.learner_id = u.id) AS average_score,
        (SELECT sum(d.seconds) FROM daily_activity d WHERE d.learner_id = u.id
           AND d.date BETWEEN ${pop.from}::date AND ${pop.to}::date) AS seconds,
        u.last_seen_at
      FROM pop JOIN users u ON u.id = pop.learner_id
      ORDER BY pop.batch_code NULLS LAST, u.first_name NULLS LAST, u.id
      LIMIT 5000`;
    return rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      batchCode: r.batch_code,
      districtCode: r.district_code,
      tradeCode: r.trade_code,
      lessonsPassed: Number(r.lessons_passed),
      averageScore: r.average_score === null ? null : Number(r.average_score),
      minutes: Math.round(Number(r.seconds ?? 0) / 60),
      lastSeenAt: r.last_seen_at,
    }));
  }

  /** FR-904. A trainer may open only learners in their own batches (FR-908). */
  async learner(auth: AccessClaims, id: string): Promise<LearnerDetailDto> {
    const to = istToday();
    const from = addDays(to, -59);
    const [row] = (await this.learners(auth, { from, to })).filter((r) => r.id === id);
    if (!row) throw new ApiError(404, 'learner_not_found');
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id },
      select: { phoneEnc: true, uiLocale: true, createdAt: true },
    });
    const [attempts, activity] = await Promise.all([
      this.prisma.db.quizAttempt.findMany({
        where: { learnerId: id },
        orderBy: { finishedAt: 'desc' },
        take: 200,
        include: {
          lesson: { select: { order: true, title: true, level: { select: { code: true } } } },
        },
      }),
      this.prisma.db.dailyActivity.findMany({
        where: { learnerId: id, date: { gte: new Date(`${from}T00:00:00Z`) } },
        orderBy: { date: 'asc' },
      }),
    ]);
    return {
      ...row,
      phone: maskPhone(this.crypto.decrypt(user.phoneEnc)),
      uiLocale: user.uiLocale,
      registeredAt: user.createdAt,
      attempts: attempts.map((a) => ({
        lessonId: a.lessonId,
        level: a.lesson.level.code,
        lessonOrder: a.lesson.order,
        lessonTitle: a.lesson.title as Record<string, string>,
        score: a.score,
        passed: a.passed,
        durationMs: a.durationMs,
        finishedAt: a.finishedAt,
      })),
      activity: activity.map((d) => ({
        date: d.date.toISOString().slice(0, 10),
        seconds: d.seconds,
      })),
      pronunciation: [],
      tutorUsage: [],
    };
  }
}
