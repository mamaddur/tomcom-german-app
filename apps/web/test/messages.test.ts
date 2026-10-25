import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routing } from '../src/i18n/routing';

// NFR-16: every locale has every key, and no message is empty.
const dir = join(__dirname, '..', 'messages');

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  return Object.entries(obj).reduce<Record<string, unknown>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object'
      ? { ...acc, ...flatten(v as Record<string, unknown>, key) }
      : { ...acc, [key]: v };
  }, {});
}

const load = (locale: string) =>
  flatten(JSON.parse(readFileSync(join(dir, `${locale}.json`), 'utf8')) as Record<string, unknown>);

describe('web messages', () => {
  it('has exactly one messages file per configured locale', () => {
    const files = readdirSync(dir)
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    expect(files).toEqual([...routing.locales].sort());
  });

  const reference = load('en');

  it.each(routing.locales)('%s has the same keys as en, all non-empty strings', (locale) => {
    const messages = load(locale);
    expect(Object.keys(messages).sort()).toEqual(Object.keys(reference).sort());
    for (const [key, value] of Object.entries(messages)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true);
    }
  });
});
