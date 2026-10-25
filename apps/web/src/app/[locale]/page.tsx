import Link from 'next/link';
import { use } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations('home');
  const tl = useTranslations('language');
  return (
    <main>
      <h1>{t('heading')}</h1>
      <p>{t('status')}</p>
      <nav aria-label={tl('label')}>
        {routing.locales.map((l) => (
          <Link key={l} href={`/${l}`} hrefLang={l}>
            {tl(l)}
          </Link>
        ))}
      </nav>
    </main>
  );
}
