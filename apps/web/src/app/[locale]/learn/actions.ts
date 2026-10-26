'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiProblem, type Tokens } from '@/lib/api';
import { learnerToken, sync } from '@/lib/learner';
import { istToday } from '@/lib/progress';
import {
  cookieOptions,
  DEVICE_MAX_AGE,
  LEARNER_ACCESS_COOKIE,
  LEARNER_DEVICE_COOKIE,
  LEARNER_REFRESH_COOKIE,
  LEARNER_REFRESH_MAX_AGE,
} from '@/lib/session';

export interface CodeState {
  step: 'phone' | 'code';
  /** Echoed back so the field is refilled after React resets the form. */
  phone?: string;
  error?: string;
  retryAfterSeconds?: number;
}

function problem(err: unknown): Pick<CodeState, 'error' | 'retryAfterSeconds'> {
  if (err instanceof ApiProblem) {
    const retry = err.extra.retryAfterSeconds;
    return { error: err.code, ...(typeof retry === 'number' ? { retryAfterSeconds: retry } : {}) };
  }
  return { error: 'generic' };
}

/** Step 1: the API sends a 6-digit code to the student's phone (synthetic numbers use the dev code). */
export async function requestCode(_prev: CodeState, form: FormData): Promise<CodeState> {
  const phone = String(form.get('phone') ?? '')
    .trim()
    .slice(0, 20);
  const locale = String(form.get('locale') ?? 'te') === 'en' ? 'en' : 'te';
  try {
    await api('/v1/auth/otp/request', { method: 'POST', body: { phone, locale } });
    return { step: 'code', phone };
  } catch (err) {
    return { step: 'phone', phone, ...problem(err) };
  }
}

/** Step 2: the code. A number that is not registered is told to sign up in the phone app. */
export async function verifyCode(_prev: CodeState, form: FormData): Promise<CodeState> {
  const phone = String(form.get('phone') ?? '').slice(0, 20);
  const locale = String(form.get('locale') ?? 'te');
  const jar = await cookies();
  let deviceId = jar.get(LEARNER_DEVICE_COOKIE)?.value;
  if (!deviceId) {
    deviceId = randomUUID();
    jar.set(LEARNER_DEVICE_COOKIE, deviceId, cookieOptions(DEVICE_MAX_AGE));
  }
  let result: {
    status: 'authenticated' | 'registration_required';
    tokens?: Tokens;
    user?: { uiLocale: string };
  };
  try {
    result = await api('/v1/auth/otp/verify', {
      method: 'POST',
      body: {
        phone,
        code: String(form.get('code') ?? ''),
        device: { clientId: deviceId, platform: 'web', appVersion: '0.1.0' },
      },
    });
  } catch (err) {
    return { step: 'code', phone, ...problem(err) };
  }
  if (result.status !== 'authenticated' || !result.tokens) {
    return { step: 'phone', phone, error: 'not_registered' };
  }
  jar.set(
    LEARNER_ACCESS_COOKIE,
    result.tokens.accessToken,
    cookieOptions(result.tokens.expiresInSeconds),
  );
  jar.set(
    LEARNER_REFRESH_COOKIE,
    result.tokens.refreshToken,
    cookieOptions(LEARNER_REFRESH_MAX_AGE),
  );
  redirect(`/${result.user?.uiLocale ?? locale}/learn`);
}

export async function signOut(form: FormData): Promise<void> {
  const jar = await cookies();
  const refreshToken = jar.get(LEARNER_REFRESH_COOKIE)?.value;
  jar.delete(LEARNER_ACCESS_COOKIE);
  jar.delete(LEARNER_REFRESH_COOKIE);
  if (refreshToken) {
    await api('/v1/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => undefined);
  }
  redirect(`/${String(form.get('locale') ?? 'te')}/learn/login`);
}

export interface AttemptInput {
  /** Made in the browser, so saving again after a lost connection never counts twice. */
  id: string;
  lessonId: string;
  packVersion: number;
  score: number;
  passed: boolean;
  durationMs: number;
  answers: Array<{ questionId: string; response: unknown; correct: boolean }>;
  finishedAt: string;
}

/**
 * Sends a finished quiz to the server (FR-405), with the learning time it took (FR-204). The
 * server keeps the larger of two totals for a day, so today's total is read first and added to.
 */
export async function submitAttempt(
  input: AttemptInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await learnerToken();
  if (!token) return { ok: false, error: 'session_expired' };
  try {
    const before = await sync(token);
    const today = istToday();
    const seconds = before.activity.find((a) => a.date === today)?.seconds ?? 0;
    await sync(token, {
      attempts: [input],
      activity: [
        {
          date: today,
          seconds: Math.min(86_400, seconds + Math.max(1, Math.round(input.durationMs / 1000))),
        },
      ],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof ApiProblem ? err.code : 'generic' };
  }
}

export interface TutorReplyResult {
  ok: true;
  id: string;
  reply: string;
  remainingToday: number;
  demo: boolean;
}

/** One message to the AI tutor (FR-601). Errors come back as codes the page can translate. */
export async function sendTutorMessage(input: {
  text: string;
  level: string;
  lessonId?: string;
}): Promise<TutorReplyResult | { ok: false; error: string }> {
  const token = await learnerToken();
  if (!token) return { ok: false, error: 'session_expired' };
  try {
    const r = await api<{ id: string; reply: string; remainingToday: number; demo: boolean }>(
      '/v1/tutor/messages',
      {
        method: 'POST',
        accessToken: token,
        body: {
          text: input.text.slice(0, 500),
          level: input.level,
          ...(input.lessonId ? { lessonId: input.lessonId } : {}),
        },
      },
    );
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: err instanceof ApiProblem ? err.code : 'generic' };
  }
}

/** FR-608: report a wrong or unsafe tutor answer. */
export async function flagTutorMessage(
  messageId: string,
  reason: string,
): Promise<{ ok: boolean }> {
  const token = await learnerToken();
  if (!token || !/^[0-9a-f-]{36}$/.test(messageId)) return { ok: false };
  try {
    await api(`/v1/tutor/messages/${messageId}/flag`, {
      method: 'POST',
      accessToken: token,
      body: { reason: reason.slice(0, 300) },
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
