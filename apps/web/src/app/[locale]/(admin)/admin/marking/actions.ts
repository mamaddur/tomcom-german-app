'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, ApiProblem } from '@/lib/api';
import { accessToken } from '@/lib/auth';

/** Saves the trainer's marks (0–100 per task) for one checkpoint attempt. */
export async function markAttempt(locale: string, id: string, form: FormData): Promise<void> {
  const t = await accessToken();
  if (!t) redirect(`/${locale}/login`);
  const marks: Record<string, { score: number; comment: string }> = {};
  for (const [key, value] of form.entries()) {
    const m = /^score-(.+)$/.exec(key);
    if (m) {
      marks[m[1]!] = {
        score: Math.min(100, Math.max(0, Number(value))) / 100,
        comment: String(form.get(`comment-${m[1]}`) ?? ''),
      };
    }
  }
  let query: string;
  try {
    const r = await api<{ status: string; total: number }>(`/v1/admin/marking/${id}`, {
      method: 'POST',
      accessToken: t,
      body: { marks },
    });
    query = `done=${r.status}&total=${Math.round(r.total * 100)}`;
  } catch (err) {
    query = `error=${err instanceof ApiProblem ? err.code : 'error'}`;
  }
  revalidatePath(`/${locale}/admin/marking`);
  redirect(`/${locale}/admin/marking?${query}`);
}
