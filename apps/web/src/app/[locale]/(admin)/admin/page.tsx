import { getTranslations } from 'next-intl/server';

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return (
    <>
      <h1>{t('welcome')}</h1>
      <p>{t('comingSoon')}</p>
    </>
  );
}
