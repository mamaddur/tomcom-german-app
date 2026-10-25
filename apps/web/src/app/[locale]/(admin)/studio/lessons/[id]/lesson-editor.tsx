'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, useTransition, type ReactNode } from 'react';
import type { L10n, LessonDetail, Question, Revision, Screen } from '@/lib/api';
import {
  addComment,
  rollbackLesson,
  saveLesson,
  transitionLesson,
  uploadMedia,
  type ActionResult,
} from '../../actions';

type T = ReturnType<typeof useTranslations<'studio'>>;
type German = { text: string; audio: string };
const SCREEN_TYPES = ['explain', 'practice', 'dialogue', 'vocab'] as const;
const QUESTION_TYPES = ['mcq', 'listen_choose', 'match_pairs', 'fill_gap', 'word_order'] as const;

/** FR-1001/1003/1005 in the browser. Authors edit; reviewers review; the API enforces both again. */
export function LessonEditor({
  initial,
  revisions,
  role,
}: {
  initial: LessonDetail;
  revisions: Revision[];
  role: string;
  userId: string;
}) {
  const t = useTranslations('studio');
  const [lesson, setLesson] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string; errors?: string[] } | null>(
    null,
  );
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');

  const editable = role === 'author' && lesson.status !== 'in_review';
  const update = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  function run(
    action: () => Promise<ActionResult<LessonDetail>>,
    success?: (l: LessonDetail) => string,
  ) {
    start(async () => {
      const r = await action();
      if (r.ok) {
        setLesson(r.data);
        setDraft(toDraft(r.data));
        setDirty(false);
        setNotice(success ? { ok: true, text: success(r.data) } : null);
      } else {
        setNotice({ ok: false, text: errorText(t, r.code), errors: r.errors });
      }
    });
  }

  const save = () =>
    run(
      () => saveLesson(lesson.id, { ...draft, expectedRevision: lesson.revision }),
      (l) => t('editor.saved', { n: l.revision }),
    );

  return (
    <article className="editor">
      <h1>{lesson.title.en ?? lesson.title.te}</h1>
      <p>
        <span className={`badge badge-${lesson.status}`}>{t(`status.${lesson.status}`)}</span>{' '}
        {t('editor.statusLine', { status: t(`status.${lesson.status}`), n: lesson.revision })}
      </p>
      {lesson.status === 'in_review' && role === 'author' && (
        <p className="notice">{t('editor.locked')}</p>
      )}
      {role !== 'author' && <p className="notice">{t('editor.readOnly')}</p>}

      <div role="status" aria-live="polite">
        {notice && (
          <div className={notice.ok ? 'notice' : 'error'}>
            <p>{notice.text}</p>
            {notice.errors && (
              <>
                <p>{t('editor.problems')}</p>
                <ul>
                  {notice.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <fieldset disabled={!editable || pending}>
        <legend>{t('editor.lesson')}</legend>
        <L10nInputs
          label={[t('titleTe'), t('titleEn')]}
          value={draft.title}
          onChange={(title) => update({ title })}
          name="title"
        />
        <L10nInputs
          label={[t('editor.descriptionTe'), t('editor.descriptionEn')]}
          value={draft.description}
          onChange={(description) => update({ description })}
          name="description"
          multiline
        />
        <label htmlFor="minutes">{t('editor.minutes')}</label>
        <input
          id="minutes"
          type="number"
          min={1}
          max={120}
          value={draft.estMinutes}
          onChange={(e) => update({ estMinutes: Number(e.target.value) })}
        />
      </fieldset>

      <fieldset disabled={!editable || pending}>
        <legend>{t('editor.screens')}</legend>
        {draft.screens.map((s, i) => (
          <Card
            key={s.id}
            title={`${i + 1}. ${t(`editor.screenTypes.${s.type}`)}`}
            onRemove={() => update({ screens: draft.screens.filter((x) => x.id !== s.id) })}
            t={t}
          >
            <ScreenFields
              screen={s}
              t={t}
              onChange={(body) =>
                update({ screens: draft.screens.map((x) => (x.id === s.id ? { ...x, body } : x)) })
              }
            />
          </Card>
        ))}
        <div className="row">
          {SCREEN_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="secondary"
              onClick={() => update({ screens: [...draft.screens, newScreen(type)] })}
            >
              {t('editor.addScreen')}: {t(`editor.screenTypes.${type}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={!editable || pending}>
        <legend>{t('editor.questions')}</legend>
        {draft.questions.map((q, i) => (
          <Card
            key={q.id}
            title={`Q${i + 1}. ${t(`editor.questionTypes.${q.type}`)}`}
            onRemove={() => update({ questions: draft.questions.filter((x) => x.id !== q.id) })}
            t={t}
          >
            <QuestionFields
              question={q}
              t={t}
              onChange={(nq) =>
                update({ questions: draft.questions.map((x) => (x.id === q.id ? nq : x)) })
              }
            />
          </Card>
        ))}
        <div className="row">
          {QUESTION_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="secondary"
              onClick={() => update({ questions: [...draft.questions, newQuestion(type)] })}
            >
              {t('editor.addQuestion')}: {t(`editor.questionTypes.${type}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="row actions">
        {role === 'author' && editable && (
          <button type="button" onClick={save} disabled={pending || !dirty}>
            {t('editor.save')}
          </button>
        )}
        {role === 'author' && lesson.status === 'draft' && (
          <button
            type="button"
            onClick={() => run(() => transitionLesson(lesson.id, 'in_review'))}
            disabled={pending || dirty}
          >
            {t('editor.submit')}
          </button>
        )}
        {role === 'author' && lesson.status === 'in_review' && (
          <button
            type="button"
            className="secondary"
            onClick={() => run(() => transitionLesson(lesson.id, 'draft'))}
            disabled={pending}
          >
            {t('editor.withdraw')}
          </button>
        )}
        {role === 'reviewer' && lesson.status === 'in_review' && (
          <button
            type="button"
            onClick={() => run(() => transitionLesson(lesson.id, 'approved'))}
            disabled={pending}
          >
            {t('editor.approve')}
          </button>
        )}
      </div>

      {role === 'reviewer' && (lesson.status === 'in_review' || lesson.status === 'approved') && (
        <section aria-labelledby="sendback">
          <h2 id="sendback">{t('editor.sendBack')}</h2>
          <label htmlFor="reason">{t('editor.reason')}</label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <button
            type="button"
            className="secondary"
            disabled={pending || !reason.trim()}
            onClick={() => run(() => transitionLesson(lesson.id, 'draft', reason.trim()))}
          >
            {t('editor.sendBack')}
          </button>
        </section>
      )}

      <section aria-labelledby="comments">
        <h2 id="comments">{t('editor.comments')}</h2>
        <ul>
          {lesson.comments.map((c) => (
            <li key={c.id}>
              <small>
                {t('revision', { n: c.revision })} ·{' '}
                {new Date(c.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </small>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
        {(role === 'author' || role === 'reviewer') && (
          <>
            <label htmlFor="comment">{t('editor.addComment')}</label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
            <button
              type="button"
              className="secondary"
              disabled={pending || !comment.trim()}
              onClick={() => {
                run(() => addComment(lesson.id, comment.trim()));
                setComment('');
              }}
            >
              {t('editor.addComment')}
            </button>
          </>
        )}
      </section>

      <section aria-labelledby="history">
        <h2 id="history">{t('editor.history')}</h2>
        <table>
          <tbody>
            {revisions.map((r) => (
              <tr key={r.revision}>
                <td>{t('revision', { n: r.revision })}</td>
                <td>{t(`status.${r.status}` as 'status.draft')}</td>
                <td>
                  {new Date(r.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                </td>
                <td>
                  {role === 'author' && editable && r.revision !== lesson.revision && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={pending}
                      onClick={() => run(() => rollbackLesson(lesson.id, r.revision))}
                    >
                      {t('editor.restore')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  );
}

// ── Pieces ──

function Card({
  title,
  onRemove,
  t,
  children,
}: {
  title: string;
  onRemove: () => void;
  t: T;
  children: ReactNode;
}) {
  return (
    <div className="card-item">
      <div className="row between">
        <strong>{title}</strong>
        <button type="button" className="link" onClick={onRemove}>
          {t('editor.remove')}
        </button>
      </div>
      {children}
    </div>
  );
}

function L10nInputs({
  label,
  value,
  onChange,
  name,
  multiline,
}: {
  label: [string, string];
  value: L10n;
  onChange: (v: L10n) => void;
  name: string;
  multiline?: boolean;
}) {
  const Field = multiline ? 'textarea' : 'input';
  const base = useId();
  return (
    <div className="pair">
      {(['te', 'en'] as const).map((loc, i) => {
        const id = `${name}-${loc}-${base}`;
        return (
          <div key={loc}>
            <label htmlFor={id}>{label[i]}</label>
            <Field
              id={id}
              lang={loc}
              value={value[loc] ?? ''}
              onChange={(e) => onChange({ ...value, [loc]: e.target.value })}
            />
          </div>
        );
      })}
    </div>
  );
}

function GermanInput({
  value,
  onChange,
  t,
}: {
  value: German;
  onChange: (v: German) => void;
  t: T;
}) {
  const [state, setState] = useState<'idle' | 'uploading' | string>('idle');
  const id = `german-${useId()}`;
  return (
    <div className="german">
      <label htmlFor={id}>{t('editor.german')}</label>
      <input
        id={id}
        lang="de"
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
      <div className="row">
        <label className="file">
          {state === 'uploading' ? t('editor.uploading') : t('editor.upload')}
          <input
            type="file"
            accept="audio/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setState('uploading');
              const form = new FormData();
              form.append('file', file);
              const r = await uploadMedia(form);
              if (r.ok) {
                onChange({ ...value, audio: r.data.id });
                setState('idle');
              } else setState(errorText(t, r.code));
            }}
          />
        </label>
        {value.audio ? (
          <audio controls src={`/api/media/${value.audio}`} aria-label={t('editor.audioReady')} />
        ) : (
          <small>{t('editor.noAudio')}</small>
        )}
        {state !== 'idle' && state !== 'uploading' && <small className="error">{state}</small>}
      </div>
    </div>
  );
}

function ScreenFields({
  screen,
  onChange,
  t,
}: {
  screen: Screen;
  onChange: (body: Record<string, unknown>) => void;
  t: T;
}) {
  const b = screen.body;
  switch (screen.type) {
    case 'explain': {
      const examples = (b.examples as German[] | undefined) ?? [];
      return (
        <>
          <L10nInputs
            label={[t('editor.textTe'), t('editor.textEn')]}
            value={(b.body as L10n) ?? {}}
            onChange={(body) => onChange({ ...b, body })}
            name="explain"
            multiline
          />
          <p>{t('editor.examples')}</p>
          {examples.map((ex, i) => (
            <GermanInput
              key={i}
              value={ex}
              t={t}
              onChange={(v) =>
                onChange({ ...b, examples: examples.map((x, j) => (j === i ? v : x)) })
              }
            />
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => onChange({ ...b, examples: [...examples, { text: '', audio: '' }] })}
          >
            {t('editor.addExample')}
          </button>
        </>
      );
    }
    case 'practice':
      return (
        <>
          <L10nInputs
            label={[t('editor.promptTe'), t('editor.promptEn')]}
            value={(b.prompt as L10n) ?? {}}
            onChange={(prompt) => onChange({ ...b, prompt })}
            name="practice"
          />
          <p>{t('editor.target')}</p>
          <GermanInput
            value={(b.target as German) ?? { text: '', audio: '' }}
            t={t}
            onChange={(target) => onChange({ ...b, target })}
          />
        </>
      );
    case 'dialogue': {
      const lines = (b.lines as Array<{ speaker: string; german: German; meaning: L10n }>) ?? [];
      return (
        <>
          <p>{t('editor.lines')}</p>
          {lines.map((line, i) => {
            const set = (patch: Partial<(typeof lines)[number]>) =>
              onChange({ ...b, lines: lines.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} className="card-item">
                <label>
                  {t('editor.speaker')}
                  <input value={line.speaker} onChange={(e) => set({ speaker: e.target.value })} />
                </label>
                <GermanInput value={line.german} t={t} onChange={(german) => set({ german })} />
                <L10nInputs
                  label={[t('editor.meaningTe'), t('editor.meaningEn')]}
                  value={line.meaning}
                  onChange={(meaning) => set({ meaning })}
                  name="line"
                />
              </div>
            );
          })}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              onChange({
                ...b,
                lines: [...lines, { speaker: 'A', german: { text: '', audio: '' }, meaning: {} }],
              })
            }
          >
            {t('editor.addLine')}
          </button>
        </>
      );
    }
    case 'vocab': {
      const ids = (b.vocabIds as string[]) ?? [];
      return (
        <label>
          {t('editor.vocabIds')}
          <textarea
            rows={3}
            value={ids.join('\n')}
            onChange={(e) =>
              onChange({
                ...b,
                vocabIds: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      );
    }
  }
}

function QuestionFields({
  question: q,
  onChange,
  t,
}: {
  question: Question;
  onChange: (q: Question) => void;
  t: T;
}) {
  const common = (
    <>
      <L10nInputs
        label={[t('editor.promptTe'), t('editor.promptEn')]}
        value={q.prompt}
        onChange={(prompt) => onChange({ ...q, prompt })}
        name="prompt"
      />
      <L10nInputs
        label={[t('editor.explanationTe'), t('editor.explanationEn')]}
        value={q.explanation}
        onChange={(explanation) => onChange({ ...q, explanation })}
        name="expl"
        multiline
      />
      <label>
        {t('editor.difficulty')}
        <input
          type="number"
          min={1}
          max={3}
          value={q.difficulty}
          onChange={(e) => onChange({ ...q, difficulty: Number(e.target.value) })}
        />
      </label>
    </>
  );
  if (q.type === 'mcq') {
    const options = (q.payload.options as string[]) ?? [];
    return (
      <>
        {common}
        <label>
          {t('editor.options')}
          <textarea
            rows={4}
            value={options.join('\n')}
            onChange={(e) =>
              onChange({ ...q, payload: { ...q.payload, options: e.target.value.split('\n') } })
            }
          />
        </label>
        <label>
          {t('editor.correct')}
          <input
            type="number"
            min={1}
            max={Math.max(options.length, 1)}
            value={Number(q.answer ?? 0) + 1}
            onChange={(e) => onChange({ ...q, answer: Number(e.target.value) - 1 })}
          />
        </label>
      </>
    );
  }
  return (
    <>
      {common}
      <JsonField
        label={t('editor.payloadJson')}
        value={q.payload}
        onChange={(payload) => onChange({ ...q, payload: payload as Record<string, unknown> })}
      />
      <JsonField
        label={t('editor.answerJson')}
        value={q.answer}
        onChange={(answer) => onChange({ ...q, answer })}
      />
    </>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [valid, setValid] = useState(true);
  return (
    <label>
      {label}
      <textarea
        rows={4}
        className={valid ? '' : 'invalid'}
        aria-invalid={!valid}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setValid(true);
          } catch {
            setValid(false);
          }
        }}
      />
    </label>
  );
}

function toDraft(l: LessonDetail) {
  return {
    title: l.title,
    description: l.description,
    estMinutes: l.estMinutes,
    tradeTags: l.tradeTags,
    screens: l.screens.map(({ id, type, body }) => ({ id, type, body })),
    questions: l.questions,
  };
}

function newScreen(type: Screen['type']): Screen {
  const id = crypto.randomUUID();
  switch (type) {
    case 'explain':
      return { id, type, body: { body: {}, examples: [] } };
    case 'practice':
      return { id, type, body: { prompt: {}, target: { text: '', audio: '' } } };
    case 'dialogue':
      return { id, type, body: { lines: [] } };
    case 'vocab':
      return { id, type, body: { vocabIds: [] } };
  }
}

function newQuestion(type: Question['type']): Question {
  return {
    id: crypto.randomUUID(),
    type,
    prompt: {},
    payload: type === 'mcq' ? { options: ['', '', ''] } : {},
    answer: type === 'mcq' ? 0 : null,
    explanation: {},
    difficulty: 1,
  };
}

function errorText(t: T, code: string) {
  return t.has(`errors.${code}`) ? t(`errors.${code}` as 'errors.generic') : t('errors.generic');
}
