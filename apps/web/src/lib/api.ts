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
