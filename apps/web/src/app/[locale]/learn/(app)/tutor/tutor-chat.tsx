'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { normalizePhrase, splitReply } from '@/lib/text';
import { flagTutorMessage, sendTutorMessage } from '../../actions';

export interface ChatMessage {
  id: string;
  fromTutor: boolean;
  text: string;
  flagged: boolean;
}

interface Props {
  locale: string;
  level: string;
  lessonId?: string;
  initial: ChatMessage[];
  /** Normalised German phrase → lesson recording URL (FR-603). */
  recordings: Record<string, string>;
  unavailable: boolean;
}

const REASONS = [
  { key: 'reasonGerman', value: 'German is wrong' },
  { key: 'reasonMeaning', value: 'Telugu or English is wrong' },
  { key: 'reasonUnsafe', value: 'Not appropriate' },
] as const;

export function TutorChat({ locale, level, lessonId, initial, recordings, unavailable }: Props) {
  const t = useTranslations('learn.tutor');
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(unavailable ? 'unavailable' : null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const [limit, setLimit] = useState(false);
  const [flagFor, setFlagFor] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  const errorText = (code: string) =>
    ({
      offline: t('offline'),
      network_error: t('offline'),
      tutor_daily_limit: t('limitReached'),
      tutor_unavailable: t('unavailable'),
      feature_disabled: t('unavailable'),
      unavailable: t('unavailable'),
      rate_limited: t('tooMany'),
    })[code] ?? t('generic');

  async function send(raw: string) {
    const body = raw.trim();
    if (!body || busy) return;
    setText('');
    setBusy(true);
    setError(null);
    setMessages((m) => [
      ...m,
      { id: `local-${m.length}`, fromTutor: false, text: body, flagged: false },
    ]);
    const r = await sendTutorMessage({ text: body, level, lessonId });
    if (r.ok) {
      setMessages((m) => [...m, { id: r.id, fromTutor: true, text: r.reply, flagged: false }]);
      setRemaining(r.remainingToday);
      setDemo(r.demo);
    } else {
      setError(r.error);
      if (r.error === 'tutor_daily_limit') setLimit(true);
    }
    setBusy(false);
    setTimeout(() => end.current?.scrollIntoView?.({ block: 'end' }), 0);
  }

  function play(phrase: string) {
    const url = recordings[normalizePhrase(phrase)];
    if (!url) {
      setNote(t('noAudio'));
      return;
    }
    setNote(null);
    new Audio(url).play().catch(() => setNote(t('noAudio')));
  }

  async function flag(id: string, reason: string) {
    setFlagFor(null);
    const r = await flagTutorMessage(id, reason);
    if (r.ok) {
      setMessages((all) => all.map((m) => (m.id === id ? { ...m, flagged: true } : m)));
      setNote(t('flagThanks'));
    } else setError('generic');
  }

  const suggestions = [t('suggestGreet'), t('suggestThanks'), t('suggestName')];
  const closed = error === 'unavailable';

  return (
    <section>
      <h1>{t('title')}</h1>
      {demo ? (
        <p className="notice" id="tutor-demo" role="note">
          {t('demoBanner')}
        </p>
      ) : null}

      {closed ? (
        <p role="status">{t('unavailable')}</p>
      ) : (
        <>
          <div className="chat" aria-live="polite">
            {messages.length === 0 ? (
              <>
                <p>{t('empty')}</p>
                <div className="choices">
                  {suggestions.map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      id={`suggest-${i}`}
                      className="choice"
                      disabled={busy}
                      onClick={() => void send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {messages.map((m) => (
              <div key={m.id} className={m.fromTutor ? 'bubble tutor' : 'bubble mine'}>
                {m.fromTutor
                  ? splitReply(m.text).map((part, i) =>
                      part.german ? (
                        <button
                          key={i}
                          type="button"
                          className="phrase"
                          lang="de"
                          onClick={() => play(part.text)}
                        >
                          🔊 {part.text}
                        </button>
                      ) : (
                        <span key={i}>{part.text}</span>
                      ),
                    )
                  : m.text}
                {m.fromTutor && !m.id.startsWith('local-') ? (
                  <div className="bubble-tools">
                    <button
                      type="button"
                      className="link-button"
                      disabled={m.flagged}
                      aria-label={t('flag')}
                      onClick={() => setFlagFor(flagFor === m.id ? null : m.id)}
                    >
                      {m.flagged ? `⚑ ${t('flagged')}` : `⚐ ${t('flag')}`}
                    </button>
                    {flagFor === m.id ? (
                      <div role="group" aria-label={t('flagTitle')} className="choices inline">
                        {REASONS.map((r) => (
                          <button
                            key={r.value}
                            type="button"
                            className="choice"
                            onClick={() => void flag(m.id, r.value)}
                          >
                            {t(r.key)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? (
              <p role="status" className="muted">
                …
              </p>
            ) : null}
            <div ref={end} />
          </div>

          {note ? <p role="status">{note}</p> : null}
          {error && !closed ? (
            <p role="alert" className="error" id="tutor-error">
              {errorText(error)}
            </p>
          ) : null}
          {remaining !== null && !limit ? (
            <p className="muted" id="tutor-remaining">
              {t('remaining', { count: remaining })}
            </p>
          ) : null}

          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <label htmlFor="tutor-input" className="visually-hidden">
              {t('hint')}
            </label>
            <input
              id="tutor-input"
              value={text}
              maxLength={500}
              disabled={limit}
              placeholder={t('hint')}
              lang={locale}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="big-button" disabled={busy || limit || !text.trim()}>
              {t('send')}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
