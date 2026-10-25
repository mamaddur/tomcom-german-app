'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { publishLevel } from '../actions';

export function PublishButton({ level }: { level: string }) {
  const t = useTranslations('studio');
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string; errors?: string[] } | null>(
    null,
  );

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await publishLevel(level);
            if (r.ok) {
              const parts = [t('publish.published', { level, version: r.data.pack.version })];
              if (r.data.skippedLessonIds.length)
                parts.push(t('publish.skipped', { count: r.data.skippedLessonIds.length }));
              setMessage({ ok: true, text: parts.join(' ') });
            } else {
              setMessage({ ok: false, text: errorText(t, r.code), errors: r.errors });
            }
          })
        }
      >
        {t('publish.publishLevel', { level })}
      </button>
      {message && (
        <div role="status" className={message.ok ? 'notice' : 'error'}>
          <p>{message.text}</p>
          {message.errors && (
            <ul>
              {message.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function errorText(t: ReturnType<typeof useTranslations<'studio'>>, code: string) {
  return t.has(`errors.${code}`) ? t(`errors.${code}` as 'errors.generic') : t('errors.generic');
}
