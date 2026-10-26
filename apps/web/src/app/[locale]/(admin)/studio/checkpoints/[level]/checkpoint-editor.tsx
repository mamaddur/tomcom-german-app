'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import type { Checkpoint, CheckpointContent, Question, WritingTask } from '@/lib/api';
import { publishCheckpoint, saveCheckpoint, type ActionResult } from '../../actions';
import {
  Card,
  errorText,
  L10nInputs,
  newQuestion,
  QUESTION_TYPES,
  QuestionFields,
} from '../../lessons/[id]/lesson-editor';

type Section = 'reading' | 'listening';
const SECTIONS: Section[] = ['reading', 'listening'];

/**
 * FR-404 checkpoint editor. Authors fill the three banks; a different reviewer publishes. Each
 * attempt draws `draw[section]` items from a bank, so banks should be larger than the draw.
 */
export function CheckpointEditor({ initial, role }: { initial: Checkpoint; role: string }) {
  const t = useTranslations('studio');
  const [cp, setCp] = useState(initial);
  const [draft, setDraft] = useState<CheckpointContent>(initial.content);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string; errors?: string[] } | null>(
    null,
  );
  const editable = role === 'author';
  const canPublish = role === 'reviewer' || role === 'super_admin';
  const update = (next: CheckpointContent) => {
    setDraft(next);
    setDirty(true);
  };
  const setSection = (s: Section, qs: Question[]) =>
    update({ ...draft, sections: { ...draft.sections, [s]: qs } });
  const setWriting = (ws: WritingTask[]) =>
    update({ ...draft, sections: { ...draft.sections, writing: ws } });

  function run(
    action: () => Promise<ActionResult<Checkpoint>>,
    success: (c: Checkpoint) => string,
  ) {
    start(async () => {
      const r = await action();
      if (r.ok) {
        setCp(r.data);
        setDraft(r.data.content);
        setDirty(false);
        setNotice({ ok: true, text: success(r.data) });
      } else {
        setNotice({ ok: false, text: errorText(t, r.code), errors: r.errors });
      }
    });
  }

  return (
    <article className="editor">
      <h1>{t('checkpoints.editorTitle', { level: cp.level })}</h1>
      <p>
        {t('checkpoints.revisionLine', { n: cp.revision })}{' '}
        {cp.publishedRevision
          ? t('checkpoints.publishedLine', { n: cp.publishedRevision })
          : t('checkpoints.notPublished')}
      </p>
      {!editable && <p className="notice">{t('editor.readOnly')}</p>}

      <div role="status" aria-live="polite">
        {notice && (
          <div className={notice.ok ? 'notice' : 'error'}>
            <p>{notice.text}</p>
            {notice.errors && (
              <ul>
                {notice.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <fieldset disabled={!editable || pending}>
        <legend>{t('checkpoints.rules')}</legend>
        <label htmlFor="passMark">{t('checkpoints.passMark')}</label>
        <input
          id="passMark"
          type="number"
          min={40}
          max={100}
          value={Math.round(draft.passMark * 100)}
          onChange={(e) => update({ ...draft, passMark: Number(e.target.value) / 100 })}
        />
        {(['reading', 'listening', 'writing'] as const).map((s) => (
          <div key={s}>
            <label htmlFor={`draw-${s}`}>
              {t('checkpoints.draw', { section: t(`checkpoints.sections.${s}`) })}
            </label>
            <input
              id={`draw-${s}`}
              type="number"
              min={s === 'writing' ? 0 : 1}
              max={s === 'writing' ? 3 : 30}
              value={draft.draw[s]}
              onChange={(e) =>
                update({ ...draft, draw: { ...draft.draw, [s]: Number(e.target.value) } })
              }
            />
          </div>
        ))}
      </fieldset>

      {SECTIONS.map((s) => (
        <fieldset key={s} disabled={!editable || pending}>
          <legend>
            {t(`checkpoints.sections.${s}`)} ·{' '}
            {t('checkpoints.bankSize', { n: draft.sections[s].length, draw: draft.draw[s] })}
          </legend>
          {s === 'listening' && <p>{t('checkpoints.listeningHint')}</p>}
          {draft.sections[s].map((q, i) => (
            <Card
              key={q.id}
              title={`${i + 1}. ${t(`editor.questionTypes.${q.type}`)}`}
              onRemove={() =>
                setSection(
                  s,
                  draft.sections[s].filter((x) => x.id !== q.id),
                )
              }
              t={t}
            >
              <QuestionFields
                question={q}
                t={t}
                onChange={(nq) =>
                  setSection(
                    s,
                    draft.sections[s].map((x) => (x.id === q.id ? nq : x)),
                  )
                }
              />
            </Card>
          ))}
          <div className="row">
            {(s === 'listening' ? (['listen_choose'] as const) : QUESTION_TYPES).map((type) => (
              <button
                key={type}
                type="button"
                className="secondary"
                onClick={() => setSection(s, [...draft.sections[s], newQuestion(type)])}
              >
                {t('editor.addQuestion')}: {t(`editor.questionTypes.${type}`)}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <fieldset disabled={!editable || pending}>
        <legend>
          {t('checkpoints.sections.writing')} ·{' '}
          {t('checkpoints.bankSize', {
            n: draft.sections.writing.length,
            draw: draft.draw.writing,
          })}
        </legend>
        <p>{t('checkpoints.writingHint')}</p>
        {draft.sections.writing.map((w, i) => {
          const set = (nw: WritingTask) =>
            setWriting(draft.sections.writing.map((x) => (x.id === w.id ? nw : x)));
          return (
            <Card
              key={w.id}
              title={`${i + 1}. ${t('checkpoints.sections.writing')}`}
              onRemove={() => setWriting(draft.sections.writing.filter((x) => x.id !== w.id))}
              t={t}
            >
              <L10nInputs
                label={[t('editor.promptTe'), t('editor.promptEn')]}
                value={w.prompt}
                onChange={(prompt) => set({ ...w, prompt })}
                name={`wp-${w.id}`}
                multiline
              />
              <L10nInputs
                label={[t('checkpoints.guideTe'), t('checkpoints.guideEn')]}
                value={w.explanation}
                onChange={(explanation) => set({ ...w, explanation })}
                name={`wg-${w.id}`}
                multiline
              />
              <div className="pair">
                <div>
                  <label htmlFor={`min-${w.id}`}>{t('checkpoints.minWords')}</label>
                  <input
                    id={`min-${w.id}`}
                    type="number"
                    min={1}
                    value={w.payload.minWords}
                    onChange={(e) =>
                      set({ ...w, payload: { ...w.payload, minWords: Number(e.target.value) } })
                    }
                  />
                </div>
                <div>
                  <label htmlFor={`max-${w.id}`}>{t('checkpoints.maxWords')}</label>
                  <input
                    id={`max-${w.id}`}
                    type="number"
                    min={5}
                    value={w.payload.maxWords}
                    onChange={(e) =>
                      set({ ...w, payload: { ...w.payload, maxWords: Number(e.target.value) } })
                    }
                  />
                </div>
              </div>
            </Card>
          );
        })}
        <button
          type="button"
          className="secondary"
          onClick={() =>
            setWriting([
              ...draft.sections.writing,
              {
                id: crypto.randomUUID(),
                prompt: {},
                explanation: {},
                payload: { minWords: 20, maxWords: 80 },
                difficulty: 1,
              },
            ])
          }
        >
          {t('checkpoints.addWriting')}
        </button>
      </fieldset>

      {cp.problems.length > 0 && (
        <section aria-labelledby="problems">
          <h2 id="problems">{t('checkpoints.problems')}</h2>
          <ul>
            {cp.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="row actions">
        {editable && (
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={() =>
              run(
                () => saveCheckpoint(cp.level, cp.revision, draft),
                (c) => t('editor.saved', { n: c.revision }),
              )
            }
          >
            {t('editor.save')}
          </button>
        )}
        {canPublish && (
          <button
            type="button"
            disabled={pending || cp.revision === 0 || cp.publishedRevision === cp.revision}
            onClick={() =>
              run(
                () => publishCheckpoint(cp.level),
                (c) => t('checkpoints.published', { level: c.level, n: c.revision }),
              )
            }
          >
            {t('checkpoints.publish')}
          </button>
        )}
      </div>
    </article>
  );
}
