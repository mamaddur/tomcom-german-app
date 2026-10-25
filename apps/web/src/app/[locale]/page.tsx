import { redirect } from 'next/navigation';

/** The portal starts at the admin area, which sends signed-out visitors to the login page. */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/admin`);
}
