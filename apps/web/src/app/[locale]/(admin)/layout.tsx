import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { api, ApiProblem, BATCH_ROLES, type Me } from '@/lib/api';
import { CONTENT_ROLES } from '@/lib/auth';
import { ACCESS_COOKIE } from '@/lib/session';
import { signOut } from '../login/actions';

/** Every page under (admin) needs a staff session; the API decides what each role may see. */
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!accessToken) redirect(`/${locale}/login`);
  let me: Me;
  try {
    me = await api<Me>('/v1/me', { accessToken });
  } catch (err) {
    if (err instanceof ApiProblem && err.status === 401) redirect(`/${locale}/login`);
    throw err;
  }
  if (me.role === 'learner') redirect(`/${locale}/login`);
  const t = await getTranslations({ locale, namespace: 'admin' });

  return (
    <>
      <header className="topbar">
        <nav aria-label={t('portal')} className="topnav">
          <strong>{t('portal')}</strong>
          <Link href={`/${locale}/admin`}>{t('nav.home')}</Link>
          {(BATCH_ROLES as readonly string[]).includes(me.role) && (
            <>
              <Link href={`/${locale}/admin/batches`}>{t('nav.batches')}</Link>
              <Link href={`/${locale}/admin/learners`}>{t('nav.learners')}</Link>
              <Link href={`/${locale}/admin/announcements`}>{t('nav.announcements')}</Link>
            </>
          )}
          {me.role === 'super_admin' && (
            <Link href={`/${locale}/admin/audit`}>{t('nav.audit')}</Link>
          )}
          {(CONTENT_ROLES as readonly string[]).includes(me.role) && (
            <Link href={`/${locale}/studio`}>{t('nav.studio')}</Link>
          )}
        </nav>
        <span>
          {me.firstName} · {t(`roles.${me.role}` as 'roles.super_admin')}
        </span>
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit">{t('signOut')}</button>
        </form>
      </header>
      <main>{children}</main>
    </>
  );
}
