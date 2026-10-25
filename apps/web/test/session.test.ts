import { describe, expect, it } from 'vitest';
import { cookieOptions, secondsUntilExpiry } from '../src/lib/session';

const jwt = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

describe('session helpers', () => {
  it('reads seconds until a JWT expires', () => {
    const now = Date.UTC(2026, 9, 25, 10, 0, 0);
    expect(secondsUntilExpiry(jwt({ exp: now / 1000 + 300 }), now)).toBe(300);
    expect(secondsUntilExpiry(jwt({ exp: now / 1000 - 5 }), now)).toBe(-5);
  });

  it('treats malformed tokens as expired', () => {
    expect(secondsUntilExpiry('not-a-jwt')).toBe(-1);
    expect(secondsUntilExpiry(jwt({}))).toBe(-1);
  });

  it('keeps session cookies away from page scripts and other sites', () => {
    expect(cookieOptions(300)).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 300,
    });
  });
});
