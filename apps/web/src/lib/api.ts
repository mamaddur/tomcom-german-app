import 'server-only';

/** Server-side only: the browser never talks to the API or sees tokens. */
export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiProblem(0, 'network_error');
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new ApiProblem(res.status, (json.code as string) ?? 'error', json);
  return json as T;
}

/** Multipart upload (studio media) with the staff member's token. */
export async function apiUpload<T>(
  path: string,
  file: Blob,
  filename: string,
  accessToken: string,
): Promise<T> {
  const form = new FormData();
  form.append('file', file, filename);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
      cache: 'no-store',
    });
  } catch {
    throw new ApiProblem(0, 'network_error');
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiProblem(res.status, (json.code as string) ?? 'error', json);
  return json as T;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface Me {
  id: string;
  role: string;
  uiLocale: string;
  firstName: string | null;
  lastName: string | null;
}

export type L10n = Record<string, string>;

export interface LessonSummary {
  id: string;
  level: 'A1' | 'A2' | 'B1';
  order: number;
  title: L10n;
  status: 'draft' | 'in_review' | 'approved' | 'published';
  revision: number;
  publishedRevision: number | null;
  updatedAt: string;
}

export interface Screen {
  id: string;
  type: 'explain' | 'vocab' | 'dialogue' | 'practice';
  body: Record<string, unknown>;
}

export interface Question {
  id: string;
  type: 'mcq' | 'listen_choose' | 'match_pairs' | 'fill_gap' | 'word_order';
  prompt: L10n;
  payload: Record<string, unknown>;
  answer: unknown;
  explanation: L10n;
  difficulty: number;
}

export interface LessonDetail extends LessonSummary {
  description: L10n;
  estMinutes: number;
  tradeTags: string[];
  screens: Array<Screen & { order: number }>;
  questions: Question[];
  comments: Array<{
    id: string;
    revision: number;
    authorId: string;
    body: string;
    createdAt: string;
  }>;
  updatedBy: string;
}

export interface Revision {
  revision: number;
  status: string;
  createdBy: string;
  createdAt: string;
}

export interface Pack {
  level: string;
  version: number;
  bytes: number;
  lessonCount: number;
  publishedAt: string;
}

export interface Vocab {
  id: string;
  german: string;
  article?: string;
  plural?: string;
  meaning: L10n;
  audioId?: string;
  tradeTags: string[];
}

// ── Admin portal (FR-901–FR-909) ──

export const ADMIN_ROLES = ['tomcom_admin', 'super_admin'] as const;
export const BATCH_ROLES = ['trainer', 'tomcom_admin', 'super_admin'] as const;

export interface Trainer {
  id: string;
  name: string;
}

export interface Batch {
  id: string;
  code: string;
  name: string;
  districtCode: string | null;
  tradeCode: string | null;
  startDate: string | null;
  status: 'active' | 'closed';
  learnerCount: number;
  pendingInvites: number;
  trainers: Trainer[];
}

export interface BatchLearner {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  districtCode: string | null;
  tradeCode: string | null;
  source: 'code' | 'admin' | 'bulk';
  joinedAt: string;
  lastSeenAt: string | null;
  lessonsPassed: number;
}

export interface ImportResult {
  enrolled: number;
  invited: number;
  unchanged: number;
  invalidRows: number[];
}

export interface ReferenceItem {
  code: string;
  name: L10n;
}

export interface ReportFilter {
  batchId?: string;
  districtCode?: string;
  tradeCode?: string;
  trainerId?: string;
  from?: string;
  to?: string;
  level?: string;
}

export const FILTER_KEYS = [
  'batchId',
  'districtCode',
  'tradeCode',
  'trainerId',
  'from',
  'to',
  'level',
] as const;

/** Query string for the shared report filters (FR-903); empty values are left out. */
export function filterQuery(f: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]) q.set(k, f[k]!);
  return q.toString();
}

export interface Overview {
  from: string;
  to: string;
  learners: number;
  activeLearners: number;
  minutes: number;
  attempts: number;
  averageScore: number | null;
  completions: Array<{ level: string; lessons: number; completed: number }>;
  lessons: Array<{
    lessonId: string;
    level: string;
    order: number;
    title: L10n;
    attempted: number;
    passed: number;
    averageBestScore: number | null;
    dropOff: number;
  }>;
}

export interface LearnerRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  batchCode: string | null;
  districtCode: string | null;
  tradeCode: string | null;
  lessonsPassed: number;
  averageScore: number | null;
  minutes: number;
  lastSeenAt: string | null;
}

export interface LearnerDetail extends LearnerRow {
  phone: string;
  uiLocale: string;
  registeredAt: string;
  attempts: Array<{
    lessonId: string;
    level: string;
    lessonOrder: number;
    lessonTitle: L10n;
    score: number;
    passed: boolean;
    durationMs: number;
    finishedAt: string;
  }>;
  activity: Array<{ date: string; seconds: number }>;
  pronunciation: unknown[];
  tutorUsage: unknown[];
}
