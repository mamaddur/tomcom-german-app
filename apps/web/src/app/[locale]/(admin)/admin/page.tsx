import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BATCH_ROLES } from '@/lib/api';
import { CONTENT_ROLES, requireStaff } from '@/lib/auth';

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { me } = await requireStaff(locale);
  const t = await getTranslations({ locale, namespace: 'admin' });
  const can = (roles: readonly string[]) => roles.includes(me.role);
  return (
    <>
      <h1>{t('welcome')}</h1>
      <p>{t('homeIntro')}</p>
      <ul>
        {can(BATCH_ROLES) && (
          <li>
            <Link href={`/${locale}/admin/batches`}>{t('nav.batches')}</Link>
          </li>
        )}
        {can(CONTENT_ROLES) && (
          <li>
            <Link href={`/${locale}/studio`}>{t('nav.studio')}</Link>
          </li>
        )}
      </ul>
    </>
  );
}
