import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routing } from '@/i18n/routing';

export default function HomePage() {
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
