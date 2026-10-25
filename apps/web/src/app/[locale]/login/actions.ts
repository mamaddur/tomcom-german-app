'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiProblem, type Tokens } from '@/lib/api';
import {
  ACCESS_COOKIE,
  CHALLENGE_COOKIE,
  CHALLENGE_MAX_AGE,
  cookieOptions,
  DEVICE_COOKIE,
  DEVICE_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
} from '@/lib/session';

export interface LoginState {
  step: 'password' | 'otp';
  /** Echoed back so the field is refilled after React resets the form (never the password). */
  phone?: string;
  error?: string;
  retryAfterSeconds?: number;
}

/** Step 1 of 2: phone + password. The API sends the OTP; the challenge stays in an httpOnly cookie. */
export async function submitPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const phone = String(form.get('phone') ?? '').slice(0, 20);
  try {
    const res = await api<{ challengeToken: string }>('/v1/staff-auth/login', {
      method: 'POST',
      body: { phone, password: String(form.get('password') ?? '') },
    });
    (await cookies()).set(CHALLENGE_COOKIE, res.challengeToken, cookieOptions(CHALLENGE_MAX_AGE));
    return { step: 'otp', phone };
  } catch (err) {
    return { step: 'password', phone, ...problemState(err) };
  }
}

/** Step 2 of 2: the OTP. On success the session cookies are set and the admin shell opens. */
export async function submitOtp(_prev: LoginState, form: FormData): Promise<LoginState> {
  const jar = await cookies();
  const challengeToken = jar.get(CHALLENGE_COOKIE)?.value;
  if (!challengeToken) return { step: 'password', error: 'challenge_expired' };
  let deviceId = jar.get(DEVICE_COOKIE)?.value;
  if (!deviceId) {
    deviceId = randomUUID();
    jar.set(DEVICE_COOKIE, deviceId, cookieOptions(DEVICE_MAX_AGE));
  }
  let tokens: Tokens;
  try {
    ({ tokens } = await api<{ tokens: Tokens }>('/v1/staff-auth/verify', {
      method: 'POST',
      body: {
        challengeToken,
        code: String(form.get('code') ?? ''),
        device: { clientId: deviceId, platform: 'web', appVersion: '0.1.0' },
      },
    }));
  } catch (err) {
    const state = problemState(err);
    return { step: state.error === 'challenge_expired' ? 'password' : 'otp', ...state };
  }
  jar.delete(CHALLENGE_COOKIE);
  jar.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(tokens.expiresInSeconds));
  jar.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE));
  redirect(`/${String(form.get('locale') ?? 'te')}/admin`);
}

export async function signOut(form: FormData): Promise<void> {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  if (refreshToken) {
    await api('/v1/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => undefined);
  }
  redirect(`/${String(form.get('locale') ?? 'te')}/login`);
}

function problemState(err: unknown): Pick<LoginState, 'error' | 'retryAfterSeconds'> {
  if (err instanceof ApiProblem) {
    const retry = err.extra.retryAfterSeconds;
    return { error: err.code, ...(typeof retry === 'number' ? { retryAfterSeconds: retry } : {}) };
  }
  return { error: 'error' };
}
