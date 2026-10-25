import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { api, type LessonSummary } from '@/lib/api';
import { CONTENT_ROLES, requireStaff } from '@/lib/auth';
import { createLesson } from './actions';
import { StudioNav } from './studio-nav';

const LEVELS = ['A1', 'A2', 'B1'] as const;

export default async function StudioHome({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const { me, accessToken, allowed } = await requireStaff(locale, CONTENT_ROLES);
  const t = await getTranslations({ locale, namespace: 'studio' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;

  const lessons = await api<LessonSummary[]>('/v1/studio/lessons', { accessToken });
  const isAuthor = me.role === 'author';

  return (
    <>
      <h1>{t('title')}</h1>
      <StudioNav locale={locale} current="lessons" />
      {error && (
        <p role="alert" className="error">
          {t.has(`errors.${error}`)
            ? t(`errors.${error}` as 'errors.generic')
            : t('errors.generic')}
        </p>
      )}
      {LEVELS.map((level) => {
        const rows = lessons.filter((l) => l.level === level);
        return (
          <section key={level} aria-labelledby={`level-${level}`}>
            <h2 id={`level-${level}`}>{level}</h2>
            {rows.length === 0 ? (
              <p>{t('noLessons')}</p>
            ) : (
              <table>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td>{l.order}</td>
                      <td>
                        <Link href={`/${locale}/studio/lessons/${l.id}`}>
                          {l.title[locale] ?? l.title.en ?? l.title.te ?? l.id}
                        </Link>
                      </td>
                      <td>
                        <span className={`badge badge-${l.status}`}>{t(`status.${l.status}`)}</span>
                      </td>
                      <td>{t('revision', { n: l.revision })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {isAuthor && (
              <details>
                <summary>{t('newLesson')}</summary>
                <form action={createLesson.bind(null, locale, level)}>
                  <label htmlFor={`te-${level}`}>{t('titleTe')}</label>
                  <input id={`te-${level}`} name="titleTe" lang="te" />
                  <label htmlFor={`en-${level}`}>{t('titleEn')}</label>
                  <input id={`en-${level}`} name="titleEn" required />
                  <button type="submit">{t('create')}</button>
                </form>
              </details>
            )}
          </section>
        );
      })}
    </>
  );
}
