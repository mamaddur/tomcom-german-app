import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { api, ApiProblem, type LessonDetail, type Revision } from '@/lib/api';
import { CONTENT_ROLES, requireStaff } from '@/lib/auth';
import { StudioNav } from '../../studio-nav';
import { LessonEditor } from './lesson-editor';

export default async function LessonPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const { me, accessToken, allowed } = await requireStaff(locale, CONTENT_ROLES);
  const t = await getTranslations({ locale, namespace: 'studio' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  let lesson: LessonDetail;
  try {
    lesson = await api<LessonDetail>(`/v1/studio/lessons/${id}`, { accessToken });
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const revisions = await api<Revision[]>(`/v1/studio/lessons/${id}/revisions`, { accessToken });
  return (
    <>
      <StudioNav locale={locale} current="lessons" />
      <LessonEditor
        key={lesson.id}
        initial={lesson}
        revisions={revisions}
        role={me.role}
        userId={me.id}
      />
    </>
  );
}
