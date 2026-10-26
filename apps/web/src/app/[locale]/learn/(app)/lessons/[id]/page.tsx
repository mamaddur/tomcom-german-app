import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AudioButton } from '@/components/audio-button';
import { appConfig, requireLearner, sync } from '@/lib/learner';
import { currentPacks, mediaUrl } from '@/lib/packs';
import { lessonStates } from '@/lib/progress';

const pick = (v: Record<string, string>, locale: string) => v[locale] ?? v.en ?? '';
const other = (locale: string) => (locale === 'te' ? 'en' : 'te');

/** FR-301–FR-305: a lesson's explanation, words, dialogue and practice, with recordings. */
export default async function LessonPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
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
  const state = lessonStates(ids, passed, config.learning.sequentialUnlock)[ids.indexOf(id)];
  const back = (
    <Link href={`/${locale}/learn`} className="small-link">
      ← {t('lesson.back')}
    </Link>
  );
  if (state === 'locked') {
    return (
      <>
        {back}
        <h1>{pick(lesson.title, locale)}</h1>
        <p role="status">{t('lesson.locked')}</p>
      </>
    );
  }

  const vocab = new Map(pack.manifest.vocab.map((v) => [v.id, v]));
  const audio = (audioId: string) => (
    <AudioButton
      src={mediaUrl(pack, audioId)}
      label={t('lesson.listen')}
      failed={t('lesson.noAudio')}
    />
  );
  const both = (v: Record<string, string>, tag: 'p' | 'h3' = 'p') => {
    const Tag = tag;
    return (
      <>
        <Tag lang={locale}>{pick(v, locale)}</Tag>
        {v[other(locale)] ? (
          <p lang={other(locale)} className="muted">
            {v[other(locale)]}
          </p>
        ) : null}
      </>
    );
  };

  return (
    <>
      {back}
      <h1>{pick(lesson.title, locale)}</h1>
      <p className="muted">{pick(lesson.description, locale)}</p>

      {[...lesson.screens]
        .sort((a, b) => a.order - b.order)
        .map((s) => (
          <section key={s.id} className="screen-card">
            {s.type === 'explain' ? (
              <>
                {both(s.body)}
                <ul className="phrase-list">
                  {(s.examples ?? []).map((e) => (
                    <li key={e.audio + e.text}>
                      {audio(e.audio)}
                      <span lang="de" className="german">
                        {e.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {s.type === 'vocab' ? (
              <>
                <h2>{t('lesson.words')}</h2>
                <ul className="phrase-list">
                  {s.vocabIds.flatMap((vid) => {
                    const v = vocab.get(vid);
                    if (!v) return [];
                    return [
                      <li key={vid}>
                        {audio(v.german.audio)}
                        <span>
                          <span lang="de" className="german">
                            {v.article ? `${v.article} ` : ''}
                            {v.german.text}
                          </span>
                          {v.plural ? <small className="muted"> · {v.plural}</small> : null}
                          <br />
                          <span lang={locale}>{pick(v.meaning, locale)}</span>
                        </span>
                      </li>,
                    ];
                  })}
                </ul>
              </>
            ) : null}
            {s.type === 'dialogue' ? (
              <>
                <h2>{t('lesson.dialogue')}</h2>
                <ul className="dialogue">
                  {s.lines.map((l) => (
                    <li key={l.german.audio}>
                      <strong>{l.speaker}</strong>
                      <div>
                        {audio(l.german.audio)}
                        <span lang="de" className="german">
                          {l.german.text}
                        </span>
                        <p className="muted" lang={locale}>
                          {pick(l.meaning, locale)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {s.type === 'practice' ? (
              <>
                <h2>{t('lesson.practice')}</h2>
                {both(s.prompt)}
                <p className="phrase-list">
                  {audio(s.target.audio)}
                  <span lang="de" className="german">
                    {s.target.text}
                  </span>
                </p>
              </>
            ) : null}
          </section>
        ))}

      <section className="quiz-cta">
        <p>{t('lesson.passMarkInfo', { mark: Math.round(config.learning.passMark * 100) })}</p>
        <Link className="big-button" href={`/${locale}/learn/lessons/${id}/quiz`}>
          {t('lesson.takeQuiz')}
        </Link>
      </section>
    </>
  );
}
