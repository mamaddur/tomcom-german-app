import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ReportFilters } from '@/components/report-filters';
import { api, ApiProblem, BATCH_ROLES, filterQuery, type Overview } from '@/lib/api';
import { CONTENT_ROLES, requireStaff } from '@/lib/auth';
import { filterOptions, percent } from '@/lib/report-data';

/** FR-902 dashboard with FR-903 filters, for trainers and admins; others get their links. */
export default async function AdminHome({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  const values = await searchParams;
  const { me, accessToken } = await requireStaff(locale);
  const t = await getTranslations({ locale, namespace: 'admin' });
  const can = (roles: readonly string[]) => roles.includes(me.role);

  if (!can(BATCH_ROLES)) {
    return (
      <>
        <h1>{t('welcome')}</h1>
        <p>{t('homeIntro')}</p>
        {can(CONTENT_ROLES) && (
          <p>
            <Link href={`/${locale}/studio`}>{t('nav.studio')}</Link>
          </p>
        )}
      </>
    );
  }

  const query = filterQuery(values);
  const options = await filterOptions(me.role, accessToken);
  let o: Overview | null = null;
  let error: string | null = null;
  try {
    o = await api<Overview>(`/v1/admin/reports/overview?${query}`, { accessToken });
  } catch (err) {
    if (!(err instanceof ApiProblem) || err.status !== 400) throw err;
    error = err.code;
  }
  const title = (l: Overview['lessons'][number]) => l.title[locale] ?? l.title.en ?? '';

  return (
    <>
      <h1>{t('dashboard.title')}</h1>
      <ReportFilters locale={locale} action={`/${locale}/admin`} values={values} {...options} />
      {error && (
        <p role="alert" className="error">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as 'errors.error') : t('errors.error')}
        </p>
      )}
      {o && (
        <>
          <p>
            {t('dashboard.range', { from: o.from, to: o.to })} ·{' '}
            <Link href={`/${locale}/admin/learners?${query}`}>{t('dashboard.seeLearners')}</Link>
          </p>
          <dl className="tiles">
            <div>
              <dt>{t('dashboard.learners')}</dt>
              <dd data-testid="tile-learners">{o.learners}</dd>
            </div>
            <div>
              <dt>{t('dashboard.active')}</dt>
              <dd data-testid="tile-active">{o.activeLearners}</dd>
            </div>
            <div>
              <dt>{t('dashboard.minutes')}</dt>
              <dd>{o.minutes}</dd>
            </div>
            <div>
              <dt>{t('dashboard.attempts')}</dt>
              <dd>{o.attempts}</dd>
            </div>
            <div>
              <dt>{t('dashboard.averageScore')}</dt>
              <dd>{percent(o.averageScore)}</dd>
            </div>
          </dl>

          <h2>{t('dashboard.completions')}</h2>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">{t('filters.level')}</th>
                <th scope="col">{t('dashboard.publishedLessons')}</th>
                <th scope="col">{t('dashboard.completedLearners')}</th>
              </tr>
            </thead>
            <tbody>
              {o.completions.map((c) => (
                <tr key={c.level}>
                  <td>{c.level}</td>
                  <td>{c.lessons}</td>
                  <td>{c.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>{t('dashboard.byLesson')}</h2>
          {o.lessons.length === 0 ? (
            <p>{t('dashboard.noLessons')}</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('filters.level')}</th>
                  <th scope="col">{t('dashboard.lesson')}</th>
                  <th scope="col">{t('dashboard.attempted')}</th>
                  <th scope="col">{t('dashboard.passed')}</th>
                  <th scope="col">{t('dashboard.averageBest')}</th>
                  <th scope="col">{t('dashboard.dropOff')}</th>
                </tr>
              </thead>
              <tbody>
                {o.lessons.map((l) => (
                  <tr key={l.lessonId}>
                    <td>{l.level}</td>
                    <td>
                      {l.order}. {title(l)}
                    </td>
                    <td>{l.attempted}</td>
                    <td>{l.passed}</td>
                    <td>{percent(l.averageBestScore)}</td>
                    <td className={l.dropOff > 0 ? 'warn' : undefined}>{l.dropOff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
