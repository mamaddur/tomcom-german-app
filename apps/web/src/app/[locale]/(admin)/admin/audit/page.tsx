import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { api, type AuditEntry } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { dateTime } from '@/lib/report-data';

const PAGE = 50;

/** FR-909: the append-only audit log, newest first. Super admins only. */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ beforeId?: string; actorId?: string }>;
}) {
  const { locale } = await params;
  const { beforeId, actorId } = await searchParams;
  const { accessToken, allowed } = await requireStaff(locale, ['super_admin']);
  const t = await getTranslations({ locale, namespace: 'admin' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const q = new URLSearchParams({ limit: String(PAGE) });
  if (beforeId && /^\d+$/.test(beforeId)) q.set('beforeId', beforeId);
  if (actorId && /^[0-9a-f-]{36}$/.test(actorId)) q.set('actorId', actorId);
  const rows = await api<AuditEntry[]>(`/v1/admin/audit-log?${q}`, { accessToken });
  const next = rows.length === PAGE ? rows[rows.length - 1]!.id : null;
  const base = `/${locale}/admin/audit${actorId ? `?actorId=${actorId}&` : '?'}`;

  return (
    <>
      <h1>{t('audit.title')}</h1>
      <p>{t('audit.intro')}</p>
      {actorId && (
        <p>
          {t('audit.filteredBy', { id: actorId })} ·{' '}
          <Link href={`/${locale}/admin/audit`}>{t('audit.clear')}</Link>
        </p>
      )}
      <table className="data">
        <thead>
          <tr>
            <th scope="col">{t('audit.when')}</th>
            <th scope="col">{t('audit.who')}</th>
            <th scope="col">{t('audit.action')}</th>
            <th scope="col">{t('audit.entity')}</th>
            <th scope="col">{t('audit.outcome')}</th>
            <th scope="col">{t('audit.details')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{dateTime(r.at, locale)}</td>
              <td>
                {r.actorId ? (
                  <Link href={`/${locale}/admin/audit?actorId=${r.actorId}`}>
                    {r.actorRole ? t(`roles.${r.actorRole}` as 'roles.super_admin') : ''} ·{' '}
                    {r.actorId.slice(-6)}
                  </Link>
                ) : (
                  '—'
                )}
              </td>
              <td>
                <code>{r.action}</code>
              </td>
              <td>{r.entityType ? `${r.entityType} ${r.entityId?.slice(-6) ?? ''}` : '—'}</td>
              <td>{r.outcome}</td>
              <td>
                <code className="details">{r.details ? JSON.stringify(r.details) : ''}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {next && (
        <p>
          <Link href={`${base}beforeId=${next}`}>{t('audit.older')}</Link>
        </p>
      )}
    </>
  );
}
