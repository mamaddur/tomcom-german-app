import { getTranslations } from 'next-intl/server';
import { api, type ReferenceItem, type Vocab } from '@/lib/api';
import { CONTENT_ROLES, requireStaff } from '@/lib/auth';
import { setVocabTrades } from '../actions';
import { StudioNav } from '../studio-nav';
import { VocabForm } from './vocab-form';

export default async function VocabPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { q, error } = await searchParams;
  const { me, accessToken, allowed } = await requireStaff(locale, CONTENT_ROLES);
  const t = await getTranslations({ locale, namespace: 'studio' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const query = (q ?? '').slice(0, 60);
  const [words, trades] = await Promise.all([
    api<Vocab[]>(`/v1/studio/vocab${query ? `?q=${encodeURIComponent(query)}` : ''}`, {
      accessToken,
    }),
    api<ReferenceItem[]>('/v1/reference/trades'),
  ]);
  const tradeName = (code: string) => trades.find((tr) => tr.code === code)?.name[locale] ?? code;
  const isAuthor = me.role === 'author';

  return (
    <>
      <h1>{t('vocab.title')}</h1>
      <StudioNav locale={locale} current="vocab" />
      <form method="get" className="row" role="search">
        <label htmlFor="q">{t('vocab.search')}</label>
        <input id="q" name="q" defaultValue={query} lang="de" />
        <button type="submit">{t('vocab.searchButton')}</button>
      </form>
      {error && (
        <p role="alert" className="error">
          {t.has(`errors.${error}`)
            ? t(`errors.${error}` as 'errors.generic')
            : t('errors.generic')}
        </p>
      )}
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
                  {/* FR-306: the trades this word belongs to; authors change them here. */}
                  {isAuthor ? (
                    <details>
                      <summary>
                        {w.tradeTags.map(tradeName).join(', ') || t('vocab.noTrades')}
                      </summary>
                      <form action={setVocabTrades.bind(null, locale, w.id)}>
                        {trades.map((tr) => (
                          <label key={tr.code} className="check">
                            <input
                              type="checkbox"
                              name="trade"
                              value={tr.code}
                              defaultChecked={w.tradeTags.includes(tr.code)}
                            />{' '}
                            {tradeName(tr.code)}
                          </label>
                        ))}
                        <button type="submit">{t('vocab.saveTrades')}</button>
                      </form>
                    </details>
                  ) : (
                    w.tradeTags.map(tradeName).join(', ')
                  )}
                </td>
                <td>
                  <code>{w.id}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isAuthor && <VocabForm trades={trades} locale={locale} />}
    </>
  );
}
