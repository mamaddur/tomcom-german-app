import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ReportFilters } from '@/components/report-filters';
import { api, ApiProblem, BATCH_ROLES, filterQuery, type LearnerRow } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { dateTime, filterOptions, percent } from '@/lib/report-data';

/** FR-903 filtered learner list; each row opens the learner detail (FR-904). */
export default async function LearnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  const values = await searchParams;
  const { me, accessToken, allowed } = await requireStaff(locale, BATCH_ROLES);
  const t = await getTranslations({ locale, namespace: 'admin' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;

  const options = await filterOptions(me.role, accessToken);
  let rows: LearnerRow[] = [];
  let error: string | null = null;
  try {
    rows = await api<LearnerRow[]>(`/v1/admin/learners?${filterQuery(values)}`, { accessToken });
  } catch (err) {
    if (!(err instanceof ApiProblem) || err.status !== 400) throw err;
    error = err.code;
  }
  const ref = (items: typeof options.districts, code: string | null) =>
    items.find((i) => i.code === code)?.name[locale] ?? code ?? '—';

  return (
    <>
      <h1>{t('learners.title')}</h1>
      <ReportFilters
        locale={locale}
        action={`/${locale}/admin/learners`}
        values={values}
        {...options}
      />
      {error && (
        <p role="alert" className="error">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as 'errors.error') : t('errors.error')}
        </p>
      )}
      <p>
        {t('learners.count', { count: rows.length })} ·{' '}
        <a href={`/api/reports/xlsx?${filterQuery(values)}&locale=${locale}`} download>
          {t('export.xlsx')}
        </a>{' '}
        ·{' '}
        <a href={`/api/reports/pdf?${filterQuery(values)}&locale=${locale}`} download>
          {t('export.pdf')}
        </a>
      </p>
      {rows.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{t('learners.name')}</th>
              <th scope="col">{t('batches.code')}</th>
              <th scope="col">{t('batches.district')}</th>
              <th scope="col">{t('batches.trade')}</th>
              <th scope="col">{t('learners.lessonsPassed')}</th>
              <th scope="col">{t('dashboard.averageBest')}</th>
              <th scope="col">{t('dashboard.minutes')}</th>
              <th scope="col">{t('learners.lastActive')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/${locale}/admin/learners/${r.id}`}>
                    {[r.firstName, r.lastName].filter(Boolean).join(' ') || t('learners.noName')}
                  </Link>
                </td>
                <td>{r.batchCode ?? '—'}</td>
                <td>{ref(options.districts, r.districtCode)}</td>
                <td>{ref(options.trades, r.tradeCode)}</td>
                <td>{r.lessonsPassed}</td>
                <td>{percent(r.averageScore)}</td>
                <td>{r.minutes}</td>
                <td>{dateTime(r.lastSeenAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
