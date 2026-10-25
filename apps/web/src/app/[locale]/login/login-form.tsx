'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { submitOtp, submitPassword, type LoginState } from './actions';

const KNOWN_ERRORS = [
  'invalid_credentials',
  'account_locked',
  'otp_invalid',
  'otp_attempts_exceeded',
  'challenge_expired',
  'rate_limited',
  'otp_resend_too_soon',
  'network_error',
  'validation_failed',
  'invalid_phone',
] as const;

export function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations('login');
  const [passwordState, passwordAction, passwordPending] = useActionState<LoginState, FormData>(
    submitPassword,
    {
      step: 'password',
    },
  );
  const [otpState, otpAction, otpPending] = useActionState<LoginState, FormData>(submitOtp, {
    step: 'otp',
  });

  const onOtpStep = passwordState.step === 'otp' && otpState.step === 'otp';
  const state = onOtpStep ? otpState : otpState.error ? otpState : passwordState;
  const error = state.error
    ? (KNOWN_ERRORS as readonly string[]).includes(state.error)
      ? t(`errors.${state.error}` as 'errors.invalid_credentials', {
          seconds: state.retryAfterSeconds ?? 0,
        })
      : t('errors.generic')
    : null;

  return (
    <div className="card">
      <h1>{t('title')}</h1>
      {onOtpStep ? (
        <form action={otpAction} noValidate>
          <input type="hidden" name="locale" value={locale} />
          <p>{t('otpSent')}</p>
          <label htmlFor="code">{t('code')}</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            aria-describedby={error ? 'login-error' : undefined}
          />
          <button type="submit" disabled={otpPending}>
            {t('verify')}
          </button>
        </form>
      ) : (
        <form action={passwordAction} noValidate>
          <label htmlFor="phone">{t('phone')}</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={passwordState.phone}
            required
            autoFocus
            aria-describedby={error ? 'login-error' : undefined}
          />
          <label htmlFor="password">{t('password')}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button type="submit" disabled={passwordPending}>
            {t('continue')}
          </button>
        </form>
      )}
      <p id="login-error" role="alert" className="error">
        {error}
      </p>
    </div>
  );
}
