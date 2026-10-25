import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === 'generated') return [];
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('OpenAPI schema names', () => {
  it('every exported DTO class name is unique (Swagger silently keeps only one of two)', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const file of files(join(import.meta.dirname, '../src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/export class (\w+Dto)\b/g)) {
        const other = seen.get(m[1]!);
        if (other) duplicates.push(`${m[1]}: ${other} and ${file}`);
        seen.set(m[1]!, file);
      }
    }
    expect(duplicates).toEqual([]);
  });
});
