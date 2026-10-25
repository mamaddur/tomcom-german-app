import argon2 from 'argon2';

/** argon2id with library defaults (64 MiB, t=3, p=4), per OWASP ASVS 2.4. */
export const hashPassword = (password: string): Promise<string> =>
  argon2.hash(password, { type: argon2.argon2id });

export const verifyPassword = (hash: string, password: string): Promise<boolean> =>
  argon2.verify(hash, password);

/** NFR-09/ASVS 2.1: length over complexity. 12–128 characters, not one repeated character. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return 'password_too_short';
  if (password.length > 128) return 'password_too_long';
  if (/^(.)\1+$/.test(password)) return 'password_too_weak';
  return null;
}

// Verified against when the account does not exist, so response time does not reveal it.
let dummyHash: Promise<string> | undefined;
export const dummyPasswordHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'));
