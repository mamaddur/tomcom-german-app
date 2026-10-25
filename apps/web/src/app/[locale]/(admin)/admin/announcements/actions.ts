'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, ApiProblem } from '@/lib/api';
import { accessToken } from '@/lib/auth';

/** FR-906: announce to everyone (admins) or to one batch. */
export async function createAnnouncement(locale: string, form: FormData): Promise<void> {
  const t = await accessToken();
  if (!t) redirect(`/${locale}/login`);
  const text = (k: string) => String(form.get(k) ?? '').trim();
  // datetime-local values are IST wall-clock times.
  const ist = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : undefined);
  let query = 'sent=1';
  try {
    await api('/v1/admin/announcements', {
      method: 'POST',
      accessToken: t,
      body: {
        title: { te: text('titleTe'), en: text('titleEn') },
        body: { te: text('bodyTe'), en: text('bodyEn') },
        ...(text('batchId') ? { batchId: text('batchId') } : {}),
        ...(text('startsAt') ? { startsAt: ist(text('startsAt')) } : {}),
        ...(text('endsAt') ? { endsAt: ist(text('endsAt')) } : {}),
      },
    });
  } catch (err) {
    query = `error=${err instanceof ApiProblem ? err.code : 'error'}`;
  }
  revalidatePath(`/${locale}/admin/announcements`);
  redirect(`/${locale}/admin/announcements?${query}`);
}

export async function endAnnouncement(locale: string, id: string): Promise<void> {
  const t = await accessToken();
  if (!t) redirect(`/${locale}/login`);
  let query = '';
  try {
    await api(`/v1/admin/announcements/${id}`, { method: 'DELETE', accessToken: t });
  } catch (err) {
    query = `?error=${err instanceof ApiProblem ? err.code : 'error'}`;
  }
  revalidatePath(`/${locale}/admin/announcements`);
  redirect(`/${locale}/admin/announcements${query}`);
}
