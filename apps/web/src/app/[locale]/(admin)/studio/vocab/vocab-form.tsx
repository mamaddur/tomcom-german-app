'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import type { ReferenceItem } from '@/lib/api';
import { createVocab, uploadMedia } from '../actions';

export function VocabForm({ trades, locale }: { trades: ReferenceItem[]; locale: string }) {
  const t = useTranslations('studio');
  const [pending, start] = useTransition();
  const [audioId, setAudioId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;
        start(async () => {
          const r = await createVocab({
            german: String(f.get('german')),
            article: String(f.get('article') || '') || undefined,
            plural: String(f.get('plural') || '') || undefined,
            meaning: { te: String(f.get('te')), en: String(f.get('en')) },
            audioId: audioId || undefined,
            tradeTags: f.getAll('trade').map(String),
          });
          if (r.ok) {
            form.reset();
            setAudioId('');
            setMessage(`${r.data.german} · ${r.data.id}`);
          } else
            setMessage(
              t.has(`errors.${r.code}`)
                ? t(`errors.${r.code}` as 'errors.generic')
                : t('errors.generic'),
            );
        });
      }}
    >
      <h2>{t('vocab.add')}</h2>
      <label htmlFor="v-german">{t('editor.german')}</label>
      <input id="v-german" name="german" lang="de" required />
      <label htmlFor="v-article">{t('vocab.article')}</label>
      <select id="v-article" name="article" defaultValue="">
        <option value="">—</option>
        <option value="der">der</option>
        <option value="die">die</option>
        <option value="das">das</option>
      </select>
      <label htmlFor="v-plural">{t('vocab.plural')}</label>
      <input id="v-plural" name="plural" lang="de" />
      <label htmlFor="v-te">{t('editor.meaningTe')}</label>
      <input id="v-te" name="te" lang="te" required />
      <label htmlFor="v-en">{t('editor.meaningEn')}</label>
      <input id="v-en" name="en" required />
      <fieldset>
        <legend>{t('vocab.trades')}</legend>
        {trades.map((tr) => (
          <label key={tr.code} className="check">
            <input type="checkbox" name="trade" value={tr.code} /> {tr.name[locale] ?? tr.name.en}
          </label>
        ))}
      </fieldset>
      <label htmlFor="v-audio">{t('editor.upload')}</label>
      <input
        id="v-audio"
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.append('file', file);
          start(async () => {
            const r = await uploadMedia(form);
            if (r.ok) setAudioId(r.data.id);
            else
              setMessage(
                t.has(`errors.${r.code}`)
                  ? t(`errors.${r.code}` as 'errors.generic')
                  : t('errors.generic'),
              );
          });
        }}
      />
      <small>{audioId ? t('editor.audioReady') : t('editor.noAudio')}</small>
      <button type="submit" disabled={pending}>
        {t('vocab.add')}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
