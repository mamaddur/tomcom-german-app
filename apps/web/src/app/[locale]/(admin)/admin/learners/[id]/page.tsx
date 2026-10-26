import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { api, ApiProblem, BATCH_ROLES, type LearnerDetail, type ReferenceItem } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { dateTime, percent } from '@/lib/report-data';

/** FR-904: one learner's attempts and learning time. Trainers only see their own batches. */
export default async function LearnerPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const { accessToken, allowed } = await requireStaff(locale, BATCH_ROLES);
  const t = await getTranslations({ locale, namespace: 'admin' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;

  let l: LearnerDetail;
  try {
    l = await api<LearnerDetail>(`/v1/admin/learners/${id}`, { accessToken });
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) {
      return <p role="alert">{t('errors.learner_not_found')}</p>;
    }
    throw err;
  }
  const [districts, trades] = await Promise.all([
    api<ReferenceItem[]>('/v1/reference/districts'),
    api<ReferenceItem[]>('/v1/reference/trades'),
  ]);
  const ref = (items: ReferenceItem[], code: string | null) =>
    items.find((i) => i.code === code)?.name[locale] ?? code ?? '—';
  const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

  return (
    <>
      <p>
        <Link href={`/${locale}/admin/learners`}>← {t('learners.title')}</Link>
      </p>
      <h1>{[l.firstName, l.lastName].filter(Boolean).join(' ') || t('learners.noName')}</h1>
      <p>
        {l.phone} · {l.batchCode ?? '—'} · {ref(districts, l.districtCode)} ·{' '}
        {ref(trades, l.tradeCode)}
      </p>
      <dl className="tiles">
        <div>
          <dt>{t('learners.lessonsPassed')}</dt>
          <dd>{l.lessonsPassed}</dd>
        </div>
        <div>
          <dt>{t('dashboard.averageBest')}</dt>
          <dd>{percent(l.averageScore)}</dd>
        </div>
        <div>
          <dt>{t('learners.minutes60')}</dt>
          <dd>{l.minutes}</dd>
        </div>
        <div>
          <dt>{t('learners.lastActive')}</dt>
          <dd>{dateTime(l.lastSeenAt, locale)}</dd>
        </div>
      </dl>

      <h2>{t('learners.attempts')}</h2>
      {l.attempts.length === 0 ? (
        <p>{t('learners.noAttempts')}</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{t('learners.when')}</th>
              <th scope="col">{t('dashboard.lesson')}</th>
              <th scope="col">{t('learners.score')}</th>
              <th scope="col">{t('learners.result')}</th>
              <th scope="col">{t('learners.duration')}</th>
            </tr>
          </thead>
          <tbody>
            {l.attempts.map((a, i) => (
              <tr key={`${a.lessonId}-${i}`}>
                <td>{dateTime(a.finishedAt, locale)}</td>
                <td>
                  {a.level} {a.lessonOrder}. {a.lessonTitle[locale] ?? a.lessonTitle.en}
                </td>
                <td>{percent(a.score)}</td>
                <td>{a.passed ? t('learners.passed') : t('learners.notPassed')}</td>
                <td>{t('learners.minutesShort', { n: minutes(a.durationMs) })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>{t('learners.timeSpent')}</h2>
      {l.activity.length === 0 ? (
        <p>{t('learners.noActivity')}</p>
      ) : (
        <table className="data">
          <tbody>
            {l.activity.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{t('learners.minutesShort', { n: Math.round(d.seconds / 60) })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>{t('learners.pronunciation')}</h2>
      <p>{t('learners.notYetAvailable')}</p>
      <h2>{t('learners.tutor')}</h2>
      <p>{t('learners.notYetAvailable')}</p>
    </>
  );
}
