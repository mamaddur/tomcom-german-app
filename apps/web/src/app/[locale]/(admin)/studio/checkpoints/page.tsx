import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { api, type Checkpoint } from '@/lib/api';
import { CONTENT_ROLES, requireStaff } from '@/lib/auth';
import { StudioNav } from '../studio-nav';

/** FR-404: one checkpoint test per level. */
export default async function CheckpointsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { accessToken, allowed } = await requireStaff(locale, CONTENT_ROLES);
  const t = await getTranslations({ locale, namespace: 'studio' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  const list = await api<Checkpoint[]>('/v1/studio/checkpoints', { accessToken });
  return (
    <>
      <h1>{t('checkpoints.title')}</h1>
      <StudioNav locale={locale} current="checkpoints" />
      <p>{t('checkpoints.intro')}</p>
      <table>
        <tbody>
          {list.map((c) => (
            <tr key={c.level}>
              <td>
                <Link href={`/${locale}/studio/checkpoints/${c.level}`}>
                  {t('checkpoints.editorTitle', { level: c.level })}
                </Link>
              </td>
              <td>
                {t('checkpoints.bankSummary', {
                  reading: c.content.sections.reading.length,
                  listening: c.content.sections.listening.length,
                  writing: c.content.sections.writing.length,
                })}
              </td>
              <td>
                {c.publishedRevision
                  ? t('checkpoints.publishedLine', { n: c.publishedRevision })
                  : t('checkpoints.notPublished')}
              </td>
              <td>
                {c.problems.length === 0
                  ? t('checkpoints.ready')
                  : t('checkpoints.notReady', { n: c.problems.length })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
