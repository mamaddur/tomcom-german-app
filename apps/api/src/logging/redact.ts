/**
 * PII redaction for everything that reaches the logs (NFR-09, NFR-13, CLAUDE.md rule 4).
 * Two layers: sensitive keys are masked wholesale, and free text is scrubbed for
 * Indian mobile numbers, e-mail addresses and OTP-like codes.
 */

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set(
  [
    'phone',
    'phoneNumber',
    'mobile',
    'msisdn',
    'otp',
    'otpCode',
    'password',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'cookie',
    'set-cookie',
    'name',
    'firstName',
    'lastName',
    'fullName',
    'nameOnCert',
    'district',
    'email',
    'pushToken',
    'totpSecret',
  ].map((k) => k.toLowerCase()),
);

// +91 / 0 prefixes optional; Indian mobiles start with 6-9 and have 10 digits.
const PHONE_RE = /(?<!\d)(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
// Any +91 number, including the synthetic +9155… range used in dev and tests.
const PLUS91_RE = /\+91[\s-]?\d{5}[\s-]?\d{5}(?!\d)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const OTP_RE = /\b(otp|code)(\s*[:=]?\s*)\d{4,8}\b/gi;

export function scrubText(text: string): string {
  return text
    .replace(PLUS91_RE, '[PHONE]')
    .replace(PHONE_RE, '[PHONE]')
    .replace(EMAIL_RE, '[EMAIL]')
    .replace(OTP_RE, (_m, label: string, sep: string) => `${label}${sep}[OTP]`);
}

export function redactPii(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[DEPTH]';
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map((v) => redactPii(v, depth + 1));
  if (value instanceof Error) {
    return {
      type: value.name,
      message: scrubText(value.message),
      stack: value.stack && scrubText(value.stack),
    };
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? REDACTED : redactPii(v, depth + 1);
    }
    return out;
  }
  return value;
}
