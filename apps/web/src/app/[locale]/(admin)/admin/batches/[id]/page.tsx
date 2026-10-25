import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ADMIN_ROLES,
  api,
  ApiProblem,
  BATCH_ROLES,
  type Batch,
  type BatchLearner,
  type ReferenceItem,
  type Trainer,
} from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { importRoster, updateBatch } from '../actions';

const fmt = (iso: string | null, locale: string) =>
  iso
    ? new Intl.DateTimeFormat(locale === 'te' ? 'te-IN' : 'en-IN', {
        dateStyle: 'medium',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(iso))
    : '—';

/** One batch: its learners, uploads (FR-901) and trainers. */
export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, id } = await params;
  const q = await searchParams;
  const { me, accessToken, allowed } = await requireStaff(locale, BATCH_ROLES);
  const t = await getTranslations({ locale, namespace: 'admin' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(me.role);

  let batch: Batch;
  try {
    batch = await api<Batch>(`/v1/admin/batches/${id}`, { accessToken });
  } catch (err) {
    if (err instanceof ApiProblem && err.status === 404) {
      return <p role="alert">{t('errors.batch_not_found')}</p>;
    }
    throw err;
  }
  const [learners, districts, trades, trainers] = await Promise.all([
    api<BatchLearner[]>(`/v1/admin/batches/${id}/learners`, { accessToken }),
    api<ReferenceItem[]>('/v1/reference/districts'),
    api<ReferenceItem[]>('/v1/reference/trades'),
    isAdmin ? api<Trainer[]>('/v1/admin/trainers', { accessToken }) : Promise.resolve([]),
  ]);
  const nameOf = (items: ReferenceItem[], code: string | null) =>
    items.find((i) => i.code === code)?.name[locale] ?? code ?? '—';
  const assigned = new Set(batch.trainers.map((tr) => tr.id));

  return (
    <>
      <p>
        <Link href={`/${locale}/admin/batches`}>← {t('batches.title')}</Link>
      </p>
      <h1>
        {batch.name} <small>({batch.code})</small>
      </h1>
      <p>
        {nameOf(districts, batch.districtCode)} · {nameOf(trades, batch.tradeCode)} ·{' '}
        {t(`batches.statuses.${batch.status}`)} · {t('batches.trainers')}:{' '}
        {batch.trainers.map((tr) => tr.name).join(', ') || '—'}
      </p>
      {q.error && (
        <p role="alert" className="error">
          {t.has(`errors.${q.error}`)
            ? t(`errors.${q.error}` as 'errors.error')
            : t('errors.error')}
        </p>
      )}
      {q.enrolled !== undefined && (
        <p role="status" className="ok">
          {t('batches.importResult', {
            enrolled: Number(q.enrolled),
            invited: Number(q.invited),
            unchanged: Number(q.unchanged),
          })}
          {Number(q.invalidCount) > 0 && (
            <>
              {' '}
              {t('batches.importInvalid', { count: Number(q.invalidCount), rows: q.invalid ?? '' })}
            </>
          )}
        </p>
      )}

      <h2>
        {t('batches.learners')} ({learners.length})
        {batch.pendingInvites > 0 && (
          <> · {t('batches.pending', { count: batch.pendingInvites })}</>
        )}
      </h2>
      {learners.length === 0 ? (
        <p>{t('batches.noLearners')}</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{t('learners.name')}</th>
              <th scope="col">{t('learners.phone')}</th>
              <th scope="col">{t('batches.district')}</th>
              <th scope="col">{t('batches.trade')}</th>
              <th scope="col">{t('learners.joined')}</th>
              <th scope="col">{t('learners.lastActive')}</th>
              <th scope="col">{t('learners.lessonsPassed')}</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => (
              <tr key={l.id}>
                <td>
                  {[l.firstName, l.lastName].filter(Boolean).join(' ') || t('learners.noName')}
                </td>
                <td>{l.phone}</td>
                <td>{nameOf(districts, l.districtCode)}</td>
                <td>{nameOf(trades, l.tradeCode)}</td>
                <td>{fmt(l.joinedAt, locale)}</td>
                <td>{fmt(l.lastSeenAt, locale)}</td>
                <td>{l.lessonsPassed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isAdmin && batch.status === 'active' && (
        <section aria-labelledby="upload">
          <h2 id="upload">{t('batches.upload')}</h2>
          <p>{t('batches.uploadHint')}</p>
          <form action={importRoster.bind(null, locale, id)}>
            <label htmlFor="file">{t('batches.file')}</label>
            <input
              id="file"
              name="file"
              type="file"
              required
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            />
            <button type="submit">{t('batches.uploadButton')}</button>
          </form>
        </section>
      )}

      {isAdmin && (
        <section aria-labelledby="manage">
          <h2 id="manage">{t('batches.manage')}</h2>
          <form action={updateBatch.bind(null, locale, id)}>
            <input type="hidden" name="trainersForm" value="1" />
            <fieldset>
              <legend>{t('batches.trainers')}</legend>
              {trainers.map((tr) => (
                <label key={tr.id} className="check">
                  <input
                    type="checkbox"
                    name="trainerIds"
                    value={tr.id}
                    defaultChecked={assigned.has(tr.id)}
                  />{' '}
                  {tr.name}
                </label>
              ))}
            </fieldset>
            <button type="submit">{t('batches.saveTrainers')}</button>
          </form>
          <form action={updateBatch.bind(null, locale, id)}>
            <input
              type="hidden"
              name="status"
              value={batch.status === 'active' ? 'closed' : 'active'}
            />
            <button type="submit">
              {batch.status === 'active' ? t('batches.close') : t('batches.reopen')}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
