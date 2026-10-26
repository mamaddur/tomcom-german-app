import { getTranslations } from 'next-intl/server';
import { api, BATCH_ROLES, type MarkingItem } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { dateTime, percent } from '@/lib/report-data';
import { markAttempt } from './actions';

/** Trainers mark checkpoint writing for their batches (FR-404, FR-407 trainer part). */
export default async function MarkingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; done?: string; total?: string }>;
}) {
  const { locale } = await params;
  const q = await searchParams;
  const { accessToken, allowed } = await requireStaff(locale, BATCH_ROLES);
  const t = await getTranslations({ locale, namespace: 'admin' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const queue = await api<MarkingItem[]>('/v1/admin/marking', { accessToken });
  const text = (l: Record<string, string>) => l[locale] ?? l.en ?? '';

  return (
    <>
      <h1>{t('marking.title')}</h1>
      <p>{t('marking.intro')}</p>
      {q.error && (
        <p role="alert" className="error">
          {t.has(`errors.${q.error}`)
            ? t(`errors.${q.error}` as 'errors.error')
            : t('errors.error')}
        </p>
      )}
      {q.done && (
        <p role="status" className="ok">
          {t('marking.saved', {
            result: t(`marking.${q.done === 'passed' ? 'passed' : 'failed'}`),
            total: Number(q.total),
          })}
        </p>
      )}
      {queue.length === 0 && <p>{t('marking.empty')}</p>}
      {queue.map((a) => (
        <section key={a.id} className="card-item" aria-labelledby={`h-${a.id}`}>
          <h2 id={`h-${a.id}`}>
            {a.learnerName || t('learners.noName')} · {a.level} · {a.batchCode ?? '—'}
          </h2>
          <p>
            {t('marking.submitted', { when: dateTime(a.submittedAt, locale) })} ·{' '}
            {t('marking.scoresSoFar', {
              reading: percent(a.sectionScores.reading ?? null),
              listening: percent(a.sectionScores.listening ?? null),
              pass: Math.round(a.passMark * 100),
            })}
          </p>
          <form action={markAttempt.bind(null, locale, a.id)}>
            {a.tasks.map((task, i) => (
              <fieldset key={task.id}>
                <legend>{t('marking.task', { n: i + 1 })}</legend>
                <p>
                  <strong>{text(task.prompt)}</strong>
                </p>
                <p className="muted">
                  {t('marking.guide')}: {text(task.guide)}
                </p>
                <blockquote lang="de" className="answer">
                  {task.text}
                </blockquote>
                <label htmlFor={`score-${task.id}`}>{t('marking.score')}</label>
                <input
                  id={`score-${task.id}`}
                  name={`score-${task.id}`}
                  type="number"
                  min={0}
                  max={100}
                  required
                />
                <label htmlFor={`comment-${task.id}`}>{t('marking.comment')}</label>
                <textarea
                  id={`comment-${task.id}`}
                  name={`comment-${task.id}`}
                  rows={2}
                  maxLength={1000}
                />
              </fieldset>
            ))}
            <button type="submit">{t('marking.save')}</button>
          </form>
        </section>
      ))}
    </>
  );
}
