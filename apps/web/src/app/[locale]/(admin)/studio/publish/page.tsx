import { getTranslations } from 'next-intl/server';
import { api, type Pack } from '@/lib/api';
import { CONTENT_ROLES, requireStaff } from '@/lib/auth';
import { StudioNav } from '../studio-nav';
import { PublishButton } from './publish-button';

const LEVELS = ['A1', 'A2', 'B1'] as const;

export default async function PublishPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { me, accessToken, allowed } = await requireStaff(locale, CONTENT_ROLES);
  const t = await getTranslations({ locale, namespace: 'studio' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const history = await Promise.all(
    LEVELS.map((l) => api<Pack[]>(`/v1/studio/levels/${l}/packs`, { accessToken })),
  );

  return (
    <>
      <h1>{t('publish.title')}</h1>
      <StudioNav locale={locale} current="publish" />
      <p>{t('publish.intro')}</p>
      {LEVELS.map((level, i) => (
        <section key={level} aria-labelledby={`pub-${level}`}>
          <h2 id={`pub-${level}`}>{level}</h2>
          {me.role === 'reviewer' && <PublishButton level={level} />}
          <h3>{t('publish.history')}</h3>
          {history[i]!.length === 0 ? (
            <p>{t('publish.none')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('publish.version')}</th>
                  <th>{t('publish.lessons')}</th>
                  <th>{t('publish.size')}</th>
                  <th>{t('publish.date')}</th>
                </tr>
              </thead>
              <tbody>
                {history[i]!.map((p) => (
                  <tr key={p.version}>
                    <td>v{p.version}</td>
                    <td>{p.lessonCount}</td>
                    <td>{Math.round(p.bytes / 1024)}</td>
                    <td>
                      {new Date(p.publishedAt).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </>
  );
}
