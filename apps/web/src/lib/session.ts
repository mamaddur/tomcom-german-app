import 'server-only';

/**
 * Staff sessions live in httpOnly, SameSite=Strict cookies set by the Next.js server, so page
 * scripts can never read the tokens (NFR-09). The API enforces the 30-minute idle timeout and
 * the 12-hour maximum (NFR-10); the cookies simply expire alongside.
 */
export const ACCESS_COOKIE = 'tomcom_at';
export const REFRESH_COOKIE = 'tomcom_rt';
export const CHALLENGE_COOKIE = 'tomcom_challenge';
export const DEVICE_COOKIE = 'tomcom_device';

/** Students have their own cookies, so a staff member and a student can use one browser. */
export const LEARNER_ACCESS_COOKIE = 'tomcom_l_at';
export const LEARNER_REFRESH_COOKIE = 'tomcom_l_rt';
export const LEARNER_DEVICE_COOKIE = 'tomcom_l_device';
export const LEARNER_REFRESH_MAX_AGE = 7 * 86400;

const secure = process.env.NODE_ENV === 'production';

export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: maxAgeSeconds,
});

/** Refresh token lifetime cap matches the API's 12-hour staff session maximum. */
export const REFRESH_MAX_AGE = 12 * 3600;
export const CHALLENGE_MAX_AGE = 5 * 60;
export const DEVICE_MAX_AGE = 365 * 86400;

/** Seconds until a JWT expires, read without verifying (the API verifies). */
export function secondsUntilExpiry(jwt: string, now = Date.now()): number {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp - Math.floor(now / 1000) : -1;
  } catch {
    return -1;
  }
}
