import { getTranslations } from 'next-intl/server';
import { ReportFilters } from '@/components/report-filters';
import { api, ApiProblem, BATCH_ROLES, filterQuery, type ReadinessRow } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { dateTime, filterOptions, percent } from '@/lib/report-data';

/** FR-907, story 6: learners who passed a level checkpoint, for exam nomination. */
export default async function ReadinessPage({
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
  const query = filterQuery(values);
  let rows: ReadinessRow[] = [];
  let error: string | null = null;
  try {
    rows = await api<ReadinessRow[]>(`/v1/admin/readiness?${query}`, { accessToken });
  } catch (err) {
    if (!(err instanceof ApiProblem) || err.status !== 400) throw err;
    error = err.code;
  }
  const ref = (items: typeof options.districts, code: string | null) =>
    items.find((i) => i.code === code)?.name[locale] ?? code ?? '—';

  return (
    <>
      <h1>{t('readiness.title')}</h1>
      <p>{t('readiness.intro')}</p>
      <ReportFilters
        locale={locale}
        action={`/${locale}/admin/readiness`}
        values={values}
        {...options}
      />
      {error && (
        <p role="alert" className="error">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as 'errors.error') : t('errors.error')}
        </p>
      )}
      <p>
        {t('readiness.count', { count: rows.length })} ·{' '}
        <a href={`/api/reports/readiness?${query}&locale=${locale}`} download>
          {t('export.xlsx')}
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
              <th scope="col">{t('filters.level')}</th>
              <th scope="col">{t('readiness.score')}</th>
              <th scope="col">{t('readiness.sections')}</th>
              <th scope="col">{t('readiness.passedOn')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.learnerId}-${r.level}`}>
                <td>
                  {[r.firstName, r.lastName].filter(Boolean).join(' ') || t('learners.noName')}
                </td>
                <td>{r.batchCode ?? '—'}</td>
                <td>{ref(options.districts, r.districtCode)}</td>
                <td>{ref(options.trades, r.tradeCode)}</td>
                <td>{r.level}</td>
                <td>{percent(r.score)}</td>
                <td>
                  {['reading', 'listening', 'writing']
                    .filter((s) => r.sectionScores[s] !== undefined)
                    .map(
                      (s) =>
                        `${t(`readiness.${s}` as 'readiness.reading')} ${percent(r.sectionScores[s]!)}`,
                    )
                    .join(' · ')}
                </td>
                <td>{dateTime(r.passedAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
