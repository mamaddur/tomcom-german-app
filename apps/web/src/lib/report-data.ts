import 'server-only';
import { ADMIN_ROLES, api, type Batch, type ReferenceItem, type Trainer } from './api';

/** Option lists for the report filters, within the staff member's scope (FR-908). */
export async function filterOptions(role: string, accessToken: string) {
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(role);
  const [batches, districts, trades, trainers] = await Promise.all([
    api<Batch[]>('/v1/admin/batches', { accessToken }),
    api<ReferenceItem[]>('/v1/reference/districts'),
    api<ReferenceItem[]>('/v1/reference/trades'),
    isAdmin ? api<Trainer[]>('/v1/admin/trainers', { accessToken }) : Promise.resolve([]),
  ]);
  return { batches, districts, trades, trainers };
}

export const percent = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export const dateTime = (iso: string | null, locale: string) =>
  iso
    ? new Intl.DateTimeFormat(locale === 'te' ? 'te-IN' : 'en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(iso))
    : '—';
