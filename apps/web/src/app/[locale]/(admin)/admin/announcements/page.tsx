import { getTranslations } from 'next-intl/server';
import { ADMIN_ROLES, api, BATCH_ROLES, type AdminAnnouncement, type Batch } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { dateTime } from '@/lib/report-data';
import { createAnnouncement, endAnnouncement } from './actions';

/** FR-906: banners in the learner app, for everyone or one batch, in Telugu and English. */
export default async function AnnouncementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { locale } = await params;
  const { error, sent } = await searchParams;
  const { me, accessToken, allowed } = await requireStaff(locale, BATCH_ROLES);
  const t = await getTranslations({ locale, namespace: 'admin' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(me.role);
  const [list, batches] = await Promise.all([
    api<AdminAnnouncement[]>('/v1/admin/announcements', { accessToken }),
    api<Batch[]>('/v1/admin/batches', { accessToken }),
  ]);
  const text = (l: Record<string, string>) => l[locale] ?? l.en ?? '';

  return (
    <>
      <h1>{t('announcements.title')}</h1>
      <p>{t('announcements.intro')}</p>
      {error && (
        <p role="alert" className="error">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as 'errors.error') : t('errors.error')}
        </p>
      )}
      {sent && (
        <p role="status" className="ok">
          {t('announcements.sent')}
        </p>
      )}

      <details open={list.length === 0}>
        <summary>{t('announcements.new')}</summary>
        <form action={createAnnouncement.bind(null, locale)}>
          <label htmlFor="batchId">{t('announcements.to')}</label>
          <select id="batchId" name="batchId" required={!isAdmin} defaultValue="">
            {isAdmin ? (
              <option value="">{t('announcements.everyone')}</option>
            ) : (
              <option value="" disabled>
                —
              </option>
            )}
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name}
              </option>
            ))}
          </select>
          <label htmlFor="titleTe">{t('announcements.titleTe')}</label>
          <input id="titleTe" name="titleTe" lang="te" required maxLength={300} />
          <label htmlFor="titleEn">{t('announcements.titleEn')}</label>
          <input id="titleEn" name="titleEn" required maxLength={300} />
          <label htmlFor="bodyTe">{t('announcements.bodyTe')}</label>
          <textarea id="bodyTe" name="bodyTe" lang="te" required maxLength={300} rows={3} />
          <label htmlFor="bodyEn">{t('announcements.bodyEn')}</label>
          <textarea id="bodyEn" name="bodyEn" required maxLength={300} rows={3} />
          <label htmlFor="startsAt">{t('announcements.startsAt')}</label>
          <input id="startsAt" name="startsAt" type="datetime-local" />
          <label htmlFor="endsAt">{t('announcements.endsAt')}</label>
          <input id="endsAt" name="endsAt" type="datetime-local" />
          <button type="submit">{t('announcements.send')}</button>
        </form>
      </details>

      {list.length === 0 ? (
        <p>{t('announcements.none')}</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{t('announcements.message')}</th>
              <th scope="col">{t('announcements.to')}</th>
              <th scope="col">{t('announcements.startsAt')}</th>
              <th scope="col">{t('announcements.endsAt')}</th>
              <th scope="col">{t('batches.status')}</th>
              <th scope="col">
                <span className="visually-hidden">{t('announcements.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{text(a.title)}</strong>
                  <br />
                  {text(a.body)}
                </td>
                <td>{a.batchCode ?? t('announcements.everyone')}</td>
                <td>{dateTime(a.startsAt, locale)}</td>
                <td>{dateTime(a.endsAt, locale)}</td>
                <td>{a.active ? t('announcements.showing') : t('announcements.notShowing')}</td>
                <td>
                  {a.active && (
                    <form action={endAnnouncement.bind(null, locale, a.id)}>
                      <button type="submit">{t('announcements.end')}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
