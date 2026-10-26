import { getTranslations, setRequestLocale } from 'next-intl/server';
import { api, ApiProblem } from '@/lib/api';
import { appConfig, requireLearner, sync } from '@/lib/learner';
import { currentPacks, recordingIndex } from '@/lib/packs';
import { lessonStates } from '@/lib/progress';
import { TutorChat, type ChatMessage } from './tutor-chat';

/** FR-601: chat with the AI tutor. It knows the level and lesson the student is on (FR-604). */
export default async function TutorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('learn.tutor');
  const { accessToken, complete } = await requireLearner(locale);
  if (!complete) return null;

  const config = await appConfig();
  if (config.features['module.tutor'] === false) {
    return <p role="status">{t('unavailable')}</p>;
  }

  const [results, packs] = await Promise.all([sync(accessToken), currentPacks(accessToken)]);
  const passed = new Set(results.lessons.filter((l) => l.passed).map((l) => l.lessonId));
  let level = 'A1';
  let lessonId: string | undefined;
  for (const pack of packs) {
    const ids = pack.manifest.lessons.map((l) => l.id);
    const states = lessonStates(ids, passed, config.learning.sequentialUnlock);
    const i = states.findIndex((s) => s === 'open');
    if (i >= 0) {
      level = pack.manifest.level;
      lessonId = ids[i];
      break;
    }
  }

  let history: ChatMessage[] = [];
  let unavailable = false;
  try {
    const rows = await api<Array<{ id: string; role: string; content: string; flagged: boolean }>>(
      '/v1/tutor/messages',
      { accessToken },
    );
    history = rows.map((r) => ({
      id: r.id,
      fromTutor: r.role === 'assistant',
      text: r.content,
      flagged: r.flagged,
    }));
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 503 || err.status === 403)) unavailable = true;
    else throw err;
  }

  return (
    <TutorChat
      locale={locale}
      level={level}
      lessonId={lessonId}
      initial={history}
      recordings={recordingIndex(packs)}
      unavailable={unavailable}
    />
  );
}
