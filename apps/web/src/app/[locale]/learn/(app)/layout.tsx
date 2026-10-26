import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { appConfig, requireLearner } from '@/lib/learner';
import { signOut } from '../actions';
import { LocaleSwitch } from './locale-switch';

/** Student pages: a signed-in student who has finished sign-up, with a simple menu. */
export default async function LearnerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('learn');
  const { me, complete } = await requireLearner(locale);
  const config = await appConfig();
  return (
    <>
      <header className="learner-bar">
        <nav aria-label={t('nav.label')}>
          <Link href={`/${locale}/learn`}>{t('nav.home')}</Link>
          {complete && config.features['module.tutor'] !== false ? (
            <Link href={`/${locale}/learn/tutor`}>{t('nav.tutor')}</Link>
          ) : null}
        </nav>
        <div className="learner-bar-right">
          <LocaleSwitch locale={locale} label={t('nav.otherLanguage')} />
          <form action={signOut}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="link-button" aria-label={me.firstName ?? ''}>
              {t('nav.signOut')}
            </button>
          </form>
        </div>
      </header>
      <main className="learner-main">
        {complete ? (
          children
        ) : (
          <div className="learner-card card">
            <h1>{t('setup.title')}</h1>
            <p>{t('setup.text')}</p>
          </div>
        )}
      </main>
    </>
  );
}
