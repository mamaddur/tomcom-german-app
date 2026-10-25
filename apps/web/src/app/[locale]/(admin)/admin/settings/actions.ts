'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, ApiProblem } from '@/lib/api';
import { accessToken } from '@/lib/auth';

async function put(locale: string, path: string, body: unknown, key: string) {
  const t = await accessToken();
  if (!t) redirect(`/${locale}/login`);
  let query = `saved=${encodeURIComponent(key)}`;
  try {
    await api(path, { method: 'PUT', accessToken: t, body });
  } catch (err) {
    query = `error=${err instanceof ApiProblem ? err.code : 'error'}&key=${encodeURIComponent(key)}`;
  }
  revalidatePath(`/${locale}/admin/settings`);
  redirect(`/${locale}/admin/settings?${query}#${key}`);
}

/** FR-1101: one setting; the form's `kind` says how to read its value. */
export async function saveSetting(locale: string, key: string, kind: string, form: FormData) {
  const raw = String(form.get('value') ?? '');
  const value =
    kind === 'number'
      ? Number(raw)
      : kind === 'boolean'
        ? form.get('value') === 'on'
        : kind === 'numbers'
          ? raw
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
              .map(Number)
          : kind === 'maintenance'
            ? {
                active: form.get('active') === 'on',
                message: { te: String(form.get('te') ?? ''), en: String(form.get('en') ?? '') },
              }
            : raw.trim();
  await put(locale, `/v1/admin/settings/${key}`, { value }, key);
}

/** FR-1103: switch an optional module on or off. */
export async function setFlag(locale: string, key: string, enabled: boolean) {
  await put(locale, `/v1/admin/feature-flags/${key}`, { enabled }, key);
}
