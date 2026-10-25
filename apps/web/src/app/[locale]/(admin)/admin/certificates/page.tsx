import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ADMIN_ROLES, api, BATCH_ROLES, type AdminCertificate } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { dateTime, percent } from '@/lib/report-data';
import { revokeCertificate } from './actions';

/** Issued certificates in the staff member's scope; admins can revoke (FR-704). */
export default async function CertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; revoked?: string }>;
}) {
  const { locale } = await params;
  const q = await searchParams;
  const { me, accessToken, allowed } = await requireStaff(locale, BATCH_ROLES);
  const t = await getTranslations({ locale, namespace: 'admin' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(me.role);
  const list = await api<AdminCertificate[]>('/v1/admin/certificates', { accessToken });

  return (
    <>
      <h1>{t('certificates.title')}</h1>
      <p>{t('certificates.intro')}</p>
      {q.error && (
        <p role="alert" className="error">
          {t.has(`errors.${q.error}`)
            ? t(`errors.${q.error}` as 'errors.error')
            : t('errors.error')}
        </p>
      )}
      {q.revoked && (
        <p role="status" className="ok">
          {t('certificates.revokedDone')}
        </p>
      )}
      {list.length === 0 ? (
        <p>{t('certificates.none')}</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{t('certificates.code')}</th>
              <th scope="col">{t('learners.name')}</th>
              <th scope="col">{t('batches.code')}</th>
              <th scope="col">{t('filters.level')}</th>
              <th scope="col">{t('readiness.score')}</th>
              <th scope="col">{t('certificates.issued')}</th>
              <th scope="col">{t('batches.status')}</th>
              {isAdmin && <th scope="col">{t('announcements.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/${locale}/c/${c.code}`}>
                    <code>{c.code}</code>
                  </Link>
                </td>
                <td>{c.holderName ?? t('certificates.nameWithheld')}</td>
                <td>{c.batchCode ?? '—'}</td>
                <td>{c.level}</td>
                <td>{percent(c.score)}</td>
                <td>{dateTime(c.issuedAt, locale)}</td>
                <td>
                  {c.status === 'valid'
                    ? t('certificates.valid')
                    : t('certificates.revoked', { reason: c.revokeReason ?? '' })}
                </td>
                {isAdmin && (
                  <td>
                    {c.status === 'valid' && (
                      <details>
                        <summary>{t('certificates.revoke')}</summary>
                        <form action={revokeCertificate.bind(null, locale, c.id)}>
                          <label htmlFor={`reason-${c.id}`}>{t('certificates.reason')}</label>
                          <input
                            id={`reason-${c.id}`}
                            name="reason"
                            required
                            minLength={5}
                            maxLength={300}
                          />
                          <button type="submit">{t('certificates.confirmRevoke')}</button>
                        </form>
                      </details>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
