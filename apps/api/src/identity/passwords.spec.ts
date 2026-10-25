import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from './passwords.js';

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse batterY')).toBe(false);
  });

  it.each([
    ['short', 'password_too_short'],
    ['a'.repeat(129), 'password_too_long'],
    ['aaaaaaaaaaaaaa', 'password_too_weak'],
    ['a long enough passphrase', null],
  ])('%s → %s', (pw, problem) => {
    expect(passwordProblem(pw)).toBe(problem);
  });
});
