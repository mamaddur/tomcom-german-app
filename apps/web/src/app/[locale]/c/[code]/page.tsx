import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { api, ApiProblem, type CertificateCheck } from '@/lib/api';

// Personal names: keep these pages out of search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** FR-703: public verification behind the certificate's QR code. No login. */
export default async function VerifyPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: 'verify' });
  let c: CertificateCheck | null = null;
  let error: string | null = null;
  try {
    c = await api<CertificateCheck>(`/v1/certificates/${encodeURIComponent(code)}`);
  } catch (err) {
    if (!(err instanceof ApiProblem)) throw err;
    error = err.status === 404 ? 'notFound' : err.status === 429 ? 'tooMany' : 'error';
  }
  const other = locale === 'te' ? 'en' : 'te';
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'te' ? 'te-IN' : 'en-IN', {
      dateStyle: 'long',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(iso));

  return (
    <main className="card verify">
      <p>
        <Link href={`/${other}/c/${code}`} lang={other}>
          {other === 'te' ? 'తెలుగు' : 'English'}
        </Link>
      </p>
      <h1>{t('title')}</h1>
      {error && (
        <p role="alert" className="error">
          {t(error as 'notFound')}
        </p>
      )}
      {c && (
        <>
          <p className={`status status-${c.status}`} role="status">
            {c.status === 'valid' ? t('valid') : t('revoked', { date: date(c.revokedAt!) })}
          </p>
          <dl>
            <dt>{t('holder')}</dt>
            <dd>{c.holderName ?? t('nameWithheld')}</dd>
            <dt>{t('level')}</dt>
            <dd>{t('levelValue', { level: c.level })}</dd>
            <dt>{t('date')}</dt>
            <dd>{date(c.issuedAt)}</dd>
            <dt>{t('score')}</dt>
            <dd>{Math.round(c.score * 100)}%</dd>
            <dt>{t('id')}</dt>
            <dd>
              <code>{c.code}</code>
            </dd>
          </dl>
          <p className="muted">{c.statement[locale] ?? c.statement.en}</p>
        </>
      )}
    </main>
  );
}
