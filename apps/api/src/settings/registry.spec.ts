import { describe, expect, it } from 'vitest';
import { SETTINGS } from './registry.js';

describe('settings registry', () => {
  it.each(Object.entries(SETTINGS))('%s: the default is allowed by its own rule', (_key, def) => {
    expect(def.schema.safeParse(def.default).success).toBe(true);
  });

  it('does not expose security limits as settings (CLAUDE.md rule 8)', () => {
    expect(Object.keys(SETTINGS).some((k) => /otp|login|lockout|password/i.test(k))).toBe(false);
  });
});
