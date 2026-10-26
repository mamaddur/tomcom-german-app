import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiProblem, type Me } from './api';
import { LEARNER_ACCESS_COOKIE } from './session';

/**
 * The signed-in student, or a redirect to the student sign-in. A student who has not finished
 * signing up (language, consent, profile, batch) is sent to a page that says to do that in the
 * phone app: registration is not built for the web.
 */
export async function requireLearner(locale: string) {
  const accessToken = (await cookies()).get(LEARNER_ACCESS_COOKIE)?.value;
  if (!accessToken) redirect(`/${locale}/learn/login`);
  let me: Me;
  try {
    me = await api<Me>('/v1/me', { accessToken });
  } catch (err) {
    if (err instanceof ApiProblem && err.status === 401) redirect(`/${locale}/learn/login`);
    throw err;
  }
  if (me.role !== 'learner') redirect(`/${locale}/learn/login`);
  return { me, accessToken, complete: me.onboarding?.profileComplete ?? false };
}

/** For server actions: the student's access token, or null. */
export async function learnerToken(): Promise<string | null> {
  return (await cookies()).get(LEARNER_ACCESS_COOKIE)?.value ?? null;
}

export interface LearnerConfig {
  features: Record<string, boolean>;
  limits: Record<string, number>;
  learning: { passMark: number; sequentialUnlock: boolean; dailyGoalMinutes: number };
}

export const appConfig = () => api<LearnerConfig>('/v1/app/config');

export interface Announcement {
  id: string;
  title: Record<string, string>;
  body: Record<string, string>;
}

export interface SyncResult {
  stored: string[];
  lessons: Array<{ lessonId: string; bestScore: number; passed: boolean }>;
  activity: Array<{ date: string; seconds: number }>;
}

/** Asks the server for the student's results (an empty sync), or sends attempts and time. */
export function sync(
  accessToken: string,
  body: {
    attempts?: unknown[];
    activity?: Array<{ date: string; seconds: number }>;
  } = {},
) {
  return api<SyncResult>('/v1/sync', {
    method: 'POST',
    accessToken,
    body: { attempts: body.attempts ?? [], activity: body.activity ?? [], words: [] },
  });
}
