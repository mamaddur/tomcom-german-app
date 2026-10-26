import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { api } from '@/lib/api';
import { type Announcement, appConfig, requireLearner, sync } from '@/lib/learner';
import { currentPacks } from '@/lib/packs';
import { istToday, lessonStates, streakDays } from '@/lib/progress';
import { Notice } from './notice';

const pick = (v: Record<string, string>, locale: string) => v[locale] ?? v.en ?? '';

/** FR-201–FR-205: continue, today's goal, streak, announcements, and progress in each level. */
export default async function LearnerHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('learn.home');
  const { me, accessToken, complete } = await requireLearner(locale);
  if (!complete) return null;

  const [config, results, packs, announcements] = await Promise.all([
    appConfig(),
    sync(accessToken),
    currentPacks(accessToken),
    api<Announcement[]>('/v1/announcements', { accessToken }),
  ]);
  const passed = new Set(results.lessons.filter((l) => l.passed).map((l) => l.lessonId));
  const best = new Map(results.lessons.map((l) => [l.lessonId, l.bestScore]));
  const today = istToday();
  const minutesToday = Math.floor(
    (results.activity.find((a) => a.date === today)?.seconds ?? 0) / 60,
  );
  const streak = streakDays(results.activity);
  const goal = config.learning.dailyGoalMinutes;

  const levels = ['A1', 'A2', 'B1'].map((code) => {
    const pack = packs.find((p) => p.manifest.level === code);
    if (!pack) return { code, pack: null, rows: [] };
    const lessons = pack.manifest.lessons;
    const states = lessonStates(
      lessons.map((l) => l.id),
      passed,
      config.learning.sequentialUnlock,
    );
    return { code, pack, rows: lessons.map((l, i) => ({ lesson: l, state: states[i]! })) };
  });

  // The next lesson to work on: the first open lesson that is not passed yet.
  const nextRow = levels.flatMap((l) => l.rows).find((r) => r.state === 'open');
  const next = nextRow
    ? { id: nextRow.lesson.id, title: pick(nextRow.lesson.title, locale) }
    : null;

  return (
    <>
      <h1>{t('welcome', { name: me.firstName ?? '' })}</h1>
      {me.batch?.name ? <p className="muted">{t('batch', { name: me.batch.name })}</p> : null}

      {announcements.map((a) => (
        <Notice
          key={a.id}
          title={pick(a.title, locale)}
          body={pick(a.body, locale)}
          closeLabel={t('closeNotice')}
        />
      ))}

      <section className="continue-card" aria-labelledby="continue-title">
        {next ? (
          <>
            <h2 id="continue-title">{t('continueWith', { title: next.title })}</h2>
            <Link className="big-button" href={`/${locale}/learn/lessons/${next.id}`}>
              {t('continue')}
            </Link>
          </>
        ) : (
          <p id="continue-title">{t('allDone')}</p>
        )}
      </section>

      <div className="stat-row">
        <div className="stat" id="stat-goal">
          <p>{t('goal', { minutes: minutesToday, goal })}</p>
          <progress
            max={goal}
            value={Math.min(goal, minutesToday)}
            aria-label={t('goal', { minutes: minutesToday, goal })}
          />
        </div>
        <div className="stat" id="stat-streak">
          <p>{streak > 0 ? t('streak', { days: streak }) : t('noStreak')}</p>
        </div>
      </div>

      <h2>{t('levels')}</h2>
      {levels.map(({ code, pack, rows }) => (
        <section key={code} className="level" aria-labelledby={`level-${code}`}>
          <h3 id={`level-${code}`}>{t(`levelName.${code}` as 'levelName.A1')}</h3>
          {pack ? (
            <>
              <p className="muted">
                {t('levelProgress', {
                  passed: rows.filter((r) => r.state === 'passed').length,
                  total: rows.length,
                })}
              </p>
              <ol className="lesson-list">
                {rows.map(({ lesson, state }, i) => (
                  <li key={lesson.id} className={`lesson-${state}`}>
                    <span className="lesson-no">{i + 1}</span>
                    <div>
                      {state === 'locked' ? (
                        <strong>{pick(lesson.title, locale)}</strong>
                      ) : (
                        <Link href={`/${locale}/learn/lessons/${lesson.id}`}>
                          <strong>{pick(lesson.title, locale)}</strong>
                        </Link>
                      )}
                      <p className="muted">
                        {state === 'passed'
                          ? t('passed', { score: Math.round((best.get(lesson.id) ?? 0) * 100) })
                          : state === 'open'
                            ? t('open')
                            : t('locked')}{' '}
                        · {t('minutes', { count: lesson.estMinutes })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="muted">{t('notAvailable')}</p>
          )}
        </section>
      ))}
    </>
  );
}
