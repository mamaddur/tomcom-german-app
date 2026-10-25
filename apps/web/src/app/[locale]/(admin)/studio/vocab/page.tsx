import { getTranslations } from 'next-intl/server';
import { api, type Vocab } from '@/lib/api';
import { CONTENT_ROLES, requireStaff } from '@/lib/auth';
import { StudioNav } from '../studio-nav';
import { VocabForm } from './vocab-form';

export default async function VocabPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  const { me, accessToken, allowed } = await requireStaff(locale, CONTENT_ROLES);
  const t = await getTranslations({ locale, namespace: 'studio' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const query = (q ?? '').slice(0, 60);
  const words = await api<Vocab[]>(
    `/v1/studio/vocab${query ? `?q=${encodeURIComponent(query)}` : ''}`,
    { accessToken },
  );

  return (
    <>
      <h1>{t('vocab.title')}</h1>
      <StudioNav locale={locale} current="vocab" />
      <form method="get" className="row" role="search">
        <label htmlFor="q">{t('vocab.search')}</label>
        <input id="q" name="q" defaultValue={query} lang="de" />
        <button type="submit">{t('vocab.searchButton')}</button>
      </form>
      {words.length === 0 ? (
        <p>{t('vocab.none')}</p>
      ) : (
        <table>
          <tbody>
            {words.map((w) => (
              <tr key={w.id}>
                <td lang="de">
                  {w.article ? `${w.article} ` : ''}
                  {w.german}
                  {w.plural ? ` (${w.plural})` : ''}
                </td>
                <td lang="te">{w.meaning.te}</td>
                <td>{w.meaning.en}</td>
                <td>
                  <code>{w.id}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {me.role === 'author' && <VocabForm />}
    </>
  );
}
