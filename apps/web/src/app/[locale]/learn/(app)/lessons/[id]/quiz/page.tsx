import { randomInt } from 'node:crypto';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { appConfig, requireLearner, sync } from '@/lib/learner';
import { currentPacks, mediaUrl } from '@/lib/packs';
import { lessonStates } from '@/lib/progress';
import { drawQuestions } from '@/lib/quiz';
import { QuizRunner } from './quiz-runner';

const pick = (v: Record<string, string>, locale: string) => v[locale] ?? v.en ?? '';

/** FR-401–FR-403: a random draw from the lesson's questions, scored in the browser against the pass mark. */
export default async function QuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { locale, id } = await params;
  const { t: attempt } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('learn');
  const { accessToken } = await requireLearner(locale);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const [config, results, packs] = await Promise.all([
    appConfig(),
    sync(accessToken),
    currentPacks(accessToken),
  ]);
  const pack = packs.find((p) => p.manifest.lessons.some((l) => l.id === id));
  const lesson = pack?.manifest.lessons.find((l) => l.id === id);
  if (!pack || !lesson) notFound();

  const passed = new Set(results.lessons.filter((l) => l.passed).map((l) => l.lessonId));
  const ids = pack.manifest.lessons.map((l) => l.id);
  if (lessonStates(ids, passed, config.learning.sequentialUnlock)[ids.indexOf(id)] === 'locked') {
    return <p role="status">{t('lesson.locked')}</p>;
  }

  const seed = randomInt(1, 2 ** 31 - 1);
  const questions = drawQuestions(lesson.questions, pack.manifest.settings.questionsPerQuiz, seed);
  // Listening questions point at a recording by media id; give the page its URL.
  const withAudio = questions.map((q) =>
    typeof q.payload.audio === 'string'
      ? { ...q, payload: { ...q.payload, audioUrl: mediaUrl(pack, q.payload.audio) } }
      : q,
  );

  return (
    <QuizRunner
      key={attempt ?? 'first'}
      locale={locale}
      lessonId={id}
      lessonTitle={pick(lesson.title, locale)}
      packVersion={pack.manifest.version}
      passMark={config.learning.passMark}
      seed={seed}
      questions={withAudio}
    />
  );
}
