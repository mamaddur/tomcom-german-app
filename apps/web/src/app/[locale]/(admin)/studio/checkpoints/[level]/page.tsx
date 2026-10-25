import { getTranslations } from 'next-intl/server';
import { api, ApiProblem, type Checkpoint } from '@/lib/api';
import { CONTENT_ROLES, requireStaff } from '@/lib/auth';
import { StudioNav } from '../../studio-nav';
import { CheckpointEditor } from './checkpoint-editor';

export default async function CheckpointPage({
  params,
}: {
  params: Promise<{ locale: string; level: string }>;
}) {
  const { locale, level } = await params;
  const { me, accessToken, allowed } = await requireStaff(locale, CONTENT_ROLES);
  const t = await getTranslations({ locale, namespace: 'studio' });
  if (!allowed) return <p role="alert">{t('forbidden')}</p>;
  let cp: Checkpoint;
  try {
    cp = await api<Checkpoint>(`/v1/studio/checkpoints/${level}`, { accessToken });
  } catch (err) {
    if (err instanceof ApiProblem && err.status === 400)
      return <p role="alert">{t('errors.generic')}</p>;
    throw err;
  }
  return (
    <>
      <StudioNav locale={locale} current="checkpoints" />
      <CheckpointEditor initial={cp} role={me.role} />
    </>
  );
}
