import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function StudioNav({
  locale,
  current,
}: {
  locale: string;
  current: 'lessons' | 'vocab' | 'publish' | 'checkpoints';
}) {
  const t = await getTranslations({ locale, namespace: 'studio' });
  const items = [
    ['lessons', `/${locale}/studio`],
    ['vocab', `/${locale}/studio/vocab`],
    ['checkpoints', `/${locale}/studio/checkpoints`],
    ['publish', `/${locale}/studio/publish`],
  ] as const;
  return (
    <nav aria-label={t('title')} className="subnav">
      {items.map(([key, href]) => (
        <Link key={key} href={href} aria-current={key === current ? 'page' : undefined}>
          {t(`nav.${key}`)}
        </Link>
      ))}
    </nav>
  );
}
