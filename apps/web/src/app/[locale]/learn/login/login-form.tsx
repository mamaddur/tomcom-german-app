'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { requestCode, verifyCode, type CodeState } from '../actions';

const KNOWN_ERRORS = [
  'otp_invalid',
  'otp_attempts_exceeded',
  'otp_expired',
  'rate_limited',
  'otp_resend_too_soon',
  'invalid_phone',
  'validation_failed',
  'not_registered',
  'network_error',
] as const;

export function LearnerLoginForm({ locale }: { locale: string }) {
  const t = useTranslations('learn.login');
  const [asked, ask, asking] = useActionState<CodeState, FormData>(requestCode, { step: 'phone' });
  const [checked, check, checking] = useActionState<CodeState, FormData>(verifyCode, {
    step: 'code',
  });

  // The code step shows once a code was sent, until the code is refused as "not registered".
  const onCodeStep = asked.step === 'code' && checked.error !== 'not_registered';
  const state = onCodeStep ? checked : asked.error ? asked : checked.error ? checked : asked;
  const error = state.error
    ? (KNOWN_ERRORS as readonly string[]).includes(state.error)
      ? t(`errors.${state.error}` as 'errors.otp_invalid', {
          seconds: state.retryAfterSeconds ?? 0,
        })
      : t('errors.generic')
    : null;

  return (
    <div className="card learner-card">
      <h1>{t('title')}</h1>
      {onCodeStep ? (
        <form action={check} noValidate>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="phone" value={asked.phone ?? ''} />
          <p>{t('codeSent', { phone: asked.phone ?? '' })}</p>
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
            className="big-input"
            aria-describedby={error ? 'login-error' : undefined}
          />
          <button type="submit" className="big-button" disabled={checking}>
            {t('verify')}
          </button>
          <Link className="small-link" href={`/${locale}/learn/login`} replace>
            {t('otherNumber')}
          </Link>
        </form>
      ) : (
        <form action={ask} noValidate>
          <input type="hidden" name="locale" value={locale} />
          <p>{t('intro')}</p>
          <label htmlFor="phone">{t('phone')}</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={state.phone}
            required
            autoFocus
            className="big-input"
            aria-describedby={error ? 'login-error' : undefined}
          />
          <button type="submit" className="big-button" disabled={asking}>
            {t('sendCode')}
          </button>
        </form>
      )}
      <p id="login-error" role="alert" className="error">
        {error}
      </p>
      <p>
        <Link className="small-link" href={`/${locale}/login`}>
          {t('staffLink')}
        </Link>
      </p>
    </div>
  );
}
