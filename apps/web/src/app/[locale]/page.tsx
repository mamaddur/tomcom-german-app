import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

/** The front door: students go to their sign-in, staff to theirs. */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');
  return (
    <main>
      <div className="card learner-card">
        <h1>{t('title')}</h1>
        <p>{t('subtitle')}</p>
        <p>
          <Link className="big-button" href={`/${locale}/learn`}>
            {t('student')}
          </Link>
        </p>
        <p>
          <Link className="big-button secondary" href={`/${locale}/admin`}>
            {t('staff')}
          </Link>
        </p>
      </div>
    </main>
  );
}
