'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioButton } from '@/components/audio-button';
import {
  correctAnswerText,
  isAnswered,
  isCorrect,
  scoreOf,
  shuffled,
  type QuizQuestion,
  type Response,
} from '@/lib/quiz';
import { submitAttempt, type AttemptInput } from '../../../../actions';

type Question = QuizQuestion & { payload: QuizQuestion['payload'] & { audioUrl?: string } };

const pick = (v: Record<string, string>, locale: string) => v[locale] ?? v.en ?? '';

interface Props {
  locale: string;
  lessonId: string;
  lessonTitle: string;
  packVersion: number;
  passMark: number;
  seed: number;
  questions: Question[];
}

/** One question at a time: answer, check, see the feedback, next. All five types are tap-only (NFR-18). */
export function QuizRunner({
  locale,
  lessonId,
  lessonTitle,
  packVersion,
  passMark,
  seed,
  questions,
}: Props) {
  const t = useTranslations('learn.quiz');
  const lesson = useTranslations('learn.lesson');
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const [retakeKey, setRetakeKey] = useState('0');
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Response[]>(() => questions.map(() => null));
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'error' | 'done'>('idle');
  const [attempt, setAttempt] = useState<AttemptInput | null>(null);

  const finished = attempt !== null;
  const q = questions[index];
  const response = responses[index] ?? null;

  const set = (value: Response) =>
    setResponses((all) => all.map((r, i) => (i === index ? value : r)));

  async function save(input: AttemptInput) {
    setSaving('saving');
    const result = await submitAttempt(input);
    setSaving(result.ok ? 'done' : 'error');
  }

  function finish() {
    const answers = questions.map((question, i) => ({
      questionId: question.id,
      response: responses[i] ?? null,
      correct: isCorrect(question, responses[i] ?? null),
    }));
    const score = scoreOf(answers.filter((a) => a.correct).length, answers.length);
    const input: AttemptInput = {
      id: crypto.randomUUID(),
      lessonId,
      packVersion,
      score,
      passed: score >= passMark,
      durationMs: Date.now() - (startedAt.current ?? Date.now()),
      answers,
      finishedAt: new Date().toISOString(),
    };
    setRetakeKey(String(Date.now()));
    setAttempt(input);
    void save(input);
  }

  if (finished) {
    const wrong = questions.filter((_, i) => !attempt.answers[i]?.correct);
    return (
      <section aria-live="polite">
        <h1>{t('title', { lesson: lessonTitle })}</h1>
        <p className="score" id="quiz-score">
          {t('yourScore', { score: Math.round(attempt.score * 100) })}
        </p>
        <p className={attempt.passed ? 'success' : 'error'} id="quiz-verdict">
          {attempt.passed ? t('passed') : t('failed', { mark: Math.round(passMark * 100) })}
        </p>
        {saving === 'saving' ? <p role="status">{t('saving')}</p> : null}
        {saving === 'error' ? (
          <p role="alert" className="error">
            {t('saveError')}{' '}
            <button type="button" className="link-button" onClick={() => void save(attempt)}>
              {t('saveRetry')}
            </button>
          </p>
        ) : null}
        {wrong.length > 0 ? (
          <>
            <h2>{t('review')}</h2>
            <ul className="review">
              {wrong.map((w) => (
                <li key={w.id}>
                  <strong>{pick(w.prompt, locale)}</strong>
                  <p className="correct-answer">{correctAnswerText(w)}</p>
                  <p className="muted">{pick(w.explanation, locale)}</p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="button-row">
          {!attempt.passed ? (
            <Link
              className="big-button"
              href={`/${locale}/learn/lessons/${lessonId}/quiz?t=${retakeKey}`}
            >
              {t('retake')}
            </Link>
          ) : null}
          <Link className="big-button secondary" href={`/${locale}/learn`}>
            {lesson('back')}
          </Link>
        </div>
      </section>
    );
  }

  if (!q) return null;
  const ok = isCorrect(q, response);
  const last = index === questions.length - 1;

  return (
    <section>
      <h1>{t('title', { lesson: lessonTitle })}</h1>
      <p className="muted" id="quiz-progress">
        {t('questionOf', { n: index + 1, total: questions.length })}
      </p>
      <progress max={questions.length} value={index + (checked ? 1 : 0)} aria-hidden="true" />
      <h2 lang={locale}>{pick(q.prompt, locale)}</h2>

      <Answer
        key={q.id}
        q={q}
        response={response}
        disabled={checked}
        seed={seed + index}
        onChange={set}
        labels={{
          listen: t('listenAndChoose'),
          failed: lesson('noAudio'),
          match: t('matchHint'),
          order: t('orderHint'),
          undo: t('undo'),
        }}
      />

      {checked ? (
        <div role="status" className={ok ? 'feedback good' : 'feedback bad'} id="quiz-feedback">
          <strong>{ok ? t('correct') : t('wrong')}</strong>
          {!ok ? <p className="correct-answer">{correctAnswerText(q)}</p> : null}
          <p className="muted">{pick(q.explanation, locale)}</p>
        </div>
      ) : null}

      <div className="button-row">
        {!checked ? (
          <button
            type="button"
            className="big-button"
            disabled={!isAnswered(q, response)}
            onClick={() => setChecked(true)}
          >
            {t('check')}
          </button>
        ) : (
          <button
            type="button"
            className="big-button"
            onClick={() => {
              setChecked(false);
              if (last) finish();
              else setIndex(index + 1);
            }}
          >
            {last ? t('seeResult') : t('next')}
          </button>
        )}
      </div>
    </section>
  );
}

function Answer({
  q,
  response,
  disabled,
  seed,
  onChange,
  labels,
}: {
  q: Question;
  response: Response;
  disabled: boolean;
  seed: number;
  onChange: (v: Response) => void;
  labels: { listen: string; failed: string; match: string; order: string; undo: string };
}) {
  const p = q.payload;

  if (q.type === 'mcq' || q.type === 'listen_choose' || q.type === 'fill_gap') {
    const options = p.options as string[];
    return (
      <div>
        {p.audioUrl ? (
          <p>
            <AudioButton src={p.audioUrl as string} label={labels.listen} failed={labels.failed} />{' '}
            {labels.listen}
          </p>
        ) : null}
        {q.type === 'fill_gap' ? (
          <p className="gap-sentence" lang="de">
            {(p.text as string).replace(
              '___',
              typeof response === 'number' ? (options[response] ?? '') : '_____',
            )}
          </p>
        ) : null}
        <div role="radiogroup" className="choices">
          {options.map((o, i) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={response === i}
              disabled={disabled}
              className={`choice ${response === i ? 'selected' : ''}`}
              lang={q.type === 'mcq' ? undefined : 'de'}
              onClick={() => onChange(i)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (q.type === 'match_pairs') {
    return (
      <MatchPairs
        left={p.left as string[]}
        right={p.right as string[]}
        response={Array.isArray(response) ? response : (p.left as string[]).map(() => null)}
        disabled={disabled}
        seed={seed}
        hint={labels.match}
        onChange={onChange}
      />
    );
  }

  const words = p.words as string[];
  const chosen = Array.isArray(response) ? (response as number[]) : [];
  const bank = shuffled(
    words.map((w, i) => ({ w, i })),
    seed,
  );
  return (
    <div>
      <p className="muted">{labels.order}</p>
      <p className="gap-sentence" lang="de" id="word-order-answer">
        {chosen.map((i) => words[i]).join(' ') || '…'}
      </p>
      <div className="choices inline">
        {bank.map(({ w, i }) => (
          <button
            key={i}
            type="button"
            className="choice"
            lang="de"
            disabled={disabled || chosen.includes(i)}
            onClick={() => onChange([...chosen, i])}
          >
            {w}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="link-button"
        disabled={disabled || chosen.length === 0}
        onClick={() => onChange(chosen.slice(0, -1))}
      >
        {labels.undo}
      </button>
    </div>
  );
}

/** Tap a left word, then the meaning on the right; a pair can be changed until it is checked. */
function MatchPairs({
  left,
  right,
  response,
  disabled,
  seed,
  hint,
  onChange,
}: {
  left: string[];
  right: string[];
  response: Array<number | null>;
  disabled: boolean;
  seed: number;
  hint: string;
  onChange: (v: Array<number | null>) => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const order = useMemo(
    () =>
      shuffled(
        right.map((_, i) => i),
        seed,
      ),
    [right, seed],
  );
  return (
    <div>
      <p className="muted">{hint}</p>
      <div className="pairs">
        <div className="choices">
          {left.map((l, i) => (
            <button
              key={l}
              type="button"
              disabled={disabled}
              className={`choice ${active === i ? 'selected' : ''} ${response[i] !== null ? 'paired' : ''}`}
              lang="de"
              aria-pressed={active === i}
              onClick={() => setActive(i)}
            >
              {l}
              {response[i] !== null ? ` = ${right[response[i]!]}` : ''}
            </button>
          ))}
        </div>
        <div className="choices">
          {order.map((ri) => (
            <button
              key={ri}
              type="button"
              disabled={disabled || active === null || response.includes(ri)}
              className="choice"
              onClick={() => {
                if (active === null) return;
                const next = response.map((r, i) => (i === active ? ri : r === ri ? null : r));
                onChange(next);
                setActive(null);
              }}
            >
              {right[ri]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
