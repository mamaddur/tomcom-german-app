import { setRequestLocale } from 'next-intl/server';
import { LearnerLoginForm } from './login-form';

export default async function LearnerLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main>
      <LearnerLoginForm locale={locale} />
    </main>
  );
}
