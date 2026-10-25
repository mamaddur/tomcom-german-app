'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  api,
  type Checkpoint,
  type CheckpointContent,
  ApiProblem,
  apiUpload,
  type L10n,
  type LessonDetail,
  type Question,
  type Screen,
  type Vocab,
} from '@/lib/api';
import { accessToken } from '@/lib/auth';

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; code: string; errors?: string[] };

async function call<T>(fn: (token: string) => Promise<T>): Promise<ActionResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, code: 'session_expired' };
  try {
    return { ok: true, data: await fn(token) };
  } catch (err) {
    if (err instanceof ApiProblem) {
      const errors = Array.isArray(err.extra.errors) ? (err.extra.errors as string[]) : undefined;
      return { ok: false, code: err.code, ...(errors ? { errors } : {}) };
    }
    return { ok: false, code: 'error' };
  }
}

export async function createLesson(locale: string, level: string, form: FormData): Promise<void> {
  const title = { te: String(form.get('titleTe') ?? ''), en: String(form.get('titleEn') ?? '') };
  const result = await call((t) =>
    api<LessonDetail>('/v1/studio/lessons', {
      method: 'POST',
      body: { level, title: dropEmpty(title) },
      accessToken: t,
    }),
  );
  if (result.ok) redirect(`/${locale}/studio/lessons/${result.data.id}`);
  redirect(`/${locale}/studio?error=${result.code}`);
}

export interface LessonDraft {
  expectedRevision: number;
  title: L10n;
  description: L10n;
  estMinutes: number;
  tradeTags: string[];
  screens: Screen[];
  questions: Question[];
}

export async function saveLesson(
  id: string,
  draft: LessonDraft,
): Promise<ActionResult<LessonDetail>> {
  const result = await call((t) =>
    api<LessonDetail>(`/v1/studio/lessons/${id}`, { method: 'PUT', body: draft, accessToken: t }),
  );
  if (result.ok) revalidatePath('/[locale]/studio', 'layout');
  return result;
}

export async function transitionLesson(
  id: string,
  to: 'in_review' | 'approved' | 'draft',
  comment?: string,
) {
  const result = await call((t) =>
    api<LessonDetail>(`/v1/studio/lessons/${id}/transition`, {
      method: 'POST',
      body: comment ? { to, comment } : { to },
      accessToken: t,
    }),
  );
  if (result.ok) revalidatePath('/[locale]/studio', 'layout');
  return result;
}

export async function addComment(id: string, body: string) {
  const result = await call((t) =>
    api<LessonDetail>(`/v1/studio/lessons/${id}/comments`, {
      method: 'POST',
      body: { body },
      accessToken: t,
    }),
  );
  if (result.ok) revalidatePath('/[locale]/studio', 'layout');
  return result;
}

export async function rollbackLesson(id: string, revision: number) {
  const result = await call((t) =>
    api<LessonDetail>(`/v1/studio/lessons/${id}/rollback`, {
      method: 'POST',
      body: { revision },
      accessToken: t,
    }),
  );
  if (result.ok) revalidatePath('/[locale]/studio', 'layout');
  return result;
}

/** Audio or image from the author's computer → converted and stored by the API → media id. */
export async function uploadMedia(
  form: FormData,
): Promise<ActionResult<{ id: string; type: string }>> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, code: 'file_required' };
  return call((t) =>
    apiUpload<{ id: string; type: string }>('/v1/studio/media', file, file.name, t),
  );
}

export async function publishLevel(level: string) {
  const result = await call((t) =>
    api<{ pack: { version: number }; skippedLessonIds: string[] }>(
      `/v1/studio/levels/${level}/publish`,
      {
        method: 'POST',
        accessToken: t,
      },
    ),
  );
  if (result.ok) revalidatePath('/[locale]/studio', 'layout');
  return result;
}

export async function createVocab(input: {
  german: string;
  article?: string;
  plural?: string;
  meaning: L10n;
  audioId?: string;
  tradeTags: string[];
}) {
  const result = await call((t) =>
    api<Vocab>('/v1/studio/vocab', {
      method: 'POST',
      body: input,
      accessToken: t,
    }),
  );
  if (result.ok) revalidatePath('/[locale]/studio/vocab', 'page');
  return result;
}

/** FR-306: which trades a word belongs to. Keeps every other field as it is. */
export async function setVocabTrades(locale: string, id: string, form: FormData): Promise<void> {
  const tradeTags = form.getAll('trade').map(String);
  const result = await call(async (t) => {
    const v = await api<Vocab>(`/v1/studio/vocab/${id}`, { accessToken: t });
    // The API refuses unknown fields: send back only what VocabInput accepts.
    const fields = ['german', 'article', 'plural', 'meaning', 'audioId', 'imageId'] as const;
    const current = v as unknown as Record<string, unknown>;
    const body = Object.fromEntries([
      ...fields.filter((k) => current[k] != null).map((k) => [k, current[k]]),
      ['tradeTags', tradeTags],
    ]);
    return api<Vocab>(`/v1/studio/vocab/${id}`, { method: 'PUT', body, accessToken: t });
  });
  revalidatePath(`/${locale}/studio/vocab`);
  redirect(`/${locale}/studio/vocab${result.ok ? '' : `?error=${result.code}`}`);
}

function dropEmpty(l: L10n): L10n {
  return Object.fromEntries(Object.entries(l).filter(([, v]) => v.trim() !== ''));
}

// ── Checkpoints (FR-404) ──

export async function saveCheckpoint(
  level: string,
  expectedRevision: number,
  content: CheckpointContent,
): Promise<ActionResult<Checkpoint>> {
  return call((t) =>
    api<Checkpoint>(`/v1/studio/checkpoints/${level}`, {
      method: 'PUT',
      body: { expectedRevision, content },
      accessToken: t,
    }),
  );
}

export async function publishCheckpoint(level: string): Promise<ActionResult<Checkpoint>> {
  return call((t) =>
    api<Checkpoint>(`/v1/studio/checkpoints/${level}/publish`, { method: 'POST', accessToken: t }),
  );
}
