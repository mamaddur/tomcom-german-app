'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, ApiProblem, apiUpload, type Batch, type ImportResult } from '@/lib/api';
import { accessToken } from '@/lib/auth';

async function token(locale: string) {
  const t = await accessToken();
  if (!t) redirect(`/${locale}/login`);
  return t;
}

const code = (err: unknown) => (err instanceof ApiProblem ? err.code : 'error');

/** FR-901: create a batch with its trainers. */
export async function createBatch(locale: string, form: FormData): Promise<void> {
  const t = await token(locale);
  let id: string;
  try {
    const batch = await api<Batch>('/v1/admin/batches', {
      method: 'POST',
      accessToken: t,
      body: {
        code: String(form.get('code') ?? '')
          .trim()
          .toUpperCase(),
        name: String(form.get('name') ?? '').trim(),
        ...(form.get('districtCode') ? { districtCode: String(form.get('districtCode')) } : {}),
        ...(form.get('tradeCode') ? { tradeCode: String(form.get('tradeCode')) } : {}),
        ...(form.get('startDate') ? { startDate: String(form.get('startDate')) } : {}),
        trainerIds: form.getAll('trainerIds').map(String),
      },
    });
    id = batch.id;
  } catch (err) {
    redirect(`/${locale}/admin/batches?error=${code(err)}`);
  }
  redirect(`/${locale}/admin/batches/${id}`);
}

export async function updateBatch(locale: string, id: string, form: FormData): Promise<void> {
  const t = await token(locale);
  const body: Record<string, unknown> = {};
  if (form.has('status')) body.status = String(form.get('status'));
  if (form.has('trainersForm')) body.trainerIds = form.getAll('trainerIds').map(String);
  let error = '';
  try {
    await api<Batch>(`/v1/admin/batches/${id}`, { method: 'PATCH', accessToken: t, body });
  } catch (err) {
    error = code(err);
  }
  revalidatePath(`/${locale}/admin/batches/${id}`);
  redirect(`/${locale}/admin/batches/${id}${error ? `?error=${error}` : ''}`);
}

/** FR-901: upload a CSV or Excel list of phone numbers. */
export async function importRoster(locale: string, id: string, form: FormData): Promise<void> {
  const t = await token(locale);
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/${locale}/admin/batches/${id}?error=file_required`);
  }
  let query: string;
  try {
    const r = await apiUpload<ImportResult>(`/v1/admin/batches/${id}/import`, file, file.name, t);
    query = new URLSearchParams({
      enrolled: String(r.enrolled),
      invited: String(r.invited),
      unchanged: String(r.unchanged),
      invalid: r.invalidRows.slice(0, 50).join(','),
      invalidCount: String(r.invalidRows.length),
    }).toString();
  } catch (err) {
    query = `error=${code(err)}`;
  }
  revalidatePath(`/${locale}/admin/batches/${id}`);
  redirect(`/${locale}/admin/batches/${id}?${query}`);
}
