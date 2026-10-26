import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ADMIN_ROLES,
  api,
  BATCH_ROLES,
  type Batch,
  type ReferenceItem,
  type Trainer,
} from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { createBatch } from './actions';

/** FR-901 batches; trainers see only their own (FR-908, enforced by the API). */
export default async function BatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const { me, accessToken, allowed } = await requireStaff(locale, BATCH_ROLES);
  const t = await getTranslations({ locale, namespace: 'admin' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(me.role);

  const [batches, districts, trades, trainers] = await Promise.all([
    api<Batch[]>('/v1/admin/batches', { accessToken }),
    api<ReferenceItem[]>('/v1/reference/districts'),
    api<ReferenceItem[]>('/v1/reference/trades'),
    isAdmin ? api<Trainer[]>('/v1/admin/trainers', { accessToken }) : Promise.resolve([]),
  ]);
  const nameOf = (items: ReferenceItem[], code: string | null) =>
    items.find((i) => i.code === code)?.name[locale] ?? code ?? '—';

  return (
    <>
      <h1>{t('batches.title')}</h1>
      {error && (
        <p role="alert" className="error">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as 'errors.error') : t('errors.error')}
        </p>
      )}
      {batches.length === 0 ? (
        <p>{t('batches.none')}</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{t('batches.code')}</th>
              <th scope="col">{t('batches.name')}</th>
              <th scope="col">{t('batches.district')}</th>
              <th scope="col">{t('batches.trade')}</th>
              <th scope="col">{t('batches.learners')}</th>
              <th scope="col">{t('batches.invited')}</th>
              <th scope="col">{t('batches.trainers')}</th>
              <th scope="col">{t('batches.status')}</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link href={`/${locale}/admin/batches/${b.id}`}>{b.code}</Link>
                </td>
                <td>{b.name}</td>
                <td>{nameOf(districts, b.districtCode)}</td>
                <td>{nameOf(trades, b.tradeCode)}</td>
                <td>{b.learnerCount}</td>
                <td>{b.pendingInvites}</td>
                <td>{b.trainers.map((tr) => tr.name).join(', ') || '—'}</td>
                <td>{t(`batches.statuses.${b.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isAdmin && (
        <details>
          <summary>{t('batches.new')}</summary>
          <form action={createBatch.bind(null, locale)}>
            <label htmlFor="code">{t('batches.code')}</label>
            <input
              id="code"
              name="code"
              required
              pattern="[A-Za-z0-9][A-Za-z0-9-]{2,23}"
              aria-describedby="code-hint"
            />
            <small id="code-hint">{t('batches.codeHint')}</small>
            <label htmlFor="name">{t('batches.name')}</label>
            <input id="name" name="name" required minLength={2} maxLength={80} />
            <label htmlFor="districtCode">{t('batches.district')}</label>
            <select id="districtCode" name="districtCode" defaultValue="">
              <option value="">—</option>
              {districts.map((d) => (
                <option key={d.code} value={d.code}>
                  {nameOf(districts, d.code)}
                </option>
              ))}
            </select>
            <label htmlFor="tradeCode">{t('batches.trade')}</label>
            <select id="tradeCode" name="tradeCode" defaultValue="">
              <option value="">—</option>
              {trades.map((d) => (
                <option key={d.code} value={d.code}>
                  {nameOf(trades, d.code)}
                </option>
              ))}
            </select>
            <label htmlFor="startDate">{t('batches.startDate')}</label>
            <input id="startDate" name="startDate" type="date" />
            <fieldset>
              <legend>{t('batches.trainers')}</legend>
              {trainers.map((tr) => (
                <label key={tr.id} className="check">
                  <input type="checkbox" name="trainerIds" value={tr.id} /> {tr.name}
                </label>
              ))}
            </fieldset>
            <button type="submit">{t('batches.create')}</button>
          </form>
        </details>
      )}
    </>
  );
}
