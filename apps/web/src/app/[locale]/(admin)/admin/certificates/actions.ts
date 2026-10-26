'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, ApiProblem } from '@/lib/api';
import { accessToken } from '@/lib/auth';

/** FR-704: revoke a certificate with a reason. */
export async function revokeCertificate(locale: string, id: string, form: FormData): Promise<void> {
  const t = await accessToken();
  if (!t) redirect(`/${locale}/login`);
  let query = 'revoked=1';
  try {
    await api(`/v1/admin/certificates/${id}/revoke`, {
      method: 'POST',
      accessToken: t,
      body: { reason: String(form.get('reason') ?? '').trim() },
    });
  } catch (err) {
    query = `error=${err instanceof ApiProblem ? err.code : 'error'}`;
  }
  revalidatePath(`/${locale}/admin/certificates`);
  redirect(`/${locale}/admin/certificates?${query}`);
}
