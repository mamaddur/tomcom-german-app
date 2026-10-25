import { describe, expect, it } from 'vitest';
import { DISTRICTS, generateDataset, SYNTHETIC_PHONE_PREFIX } from './synthetic';

// Same pattern the API's log redaction uses for real Indian mobiles.
const REAL_INDIAN_MOBILE = /^(?:\+?91)?[6-9]\d{9}$/;

describe('generateDataset', () => {
  it('is deterministic for a seed', () => {
    expect(generateDataset({ seed: 7 })).toEqual(generateDataset({ seed: 7 }));
    expect(generateDataset({ seed: 7 })).not.toEqual(generateDataset({ seed: 8 }));
  });

  it('never produces a number that could belong to a real Indian mobile', () => {
    const { learners, trainers } = generateDataset({ learners: 1000 });
    for (const p of [...learners, ...trainers].map((x) => x.phone)) {
      expect(p.startsWith(SYNTHETIC_PHONE_PREFIX)).toBe(true);
      expect(REAL_INDIAN_MOBILE.test(p)).toBe(false);
      expect(p).toMatch(/^\+91\d{10}$/);
    }
  });

  it('gives every person a unique phone', () => {
    const { learners, trainers } = generateDataset({ learners: 1000 });
    const phones = [...learners, ...trainers].map((x) => x.phone);
    expect(new Set(phones).size).toBe(phones.length);
  });

  it('marks names as synthetic and links learners to existing batches', () => {
    const data = generateDataset();
    const codes = new Set(data.batches.map((b) => b.code));
    for (const l of data.learners) {
      expect(l.firstName.startsWith('Test-')).toBe(true);
      expect(codes.has(l.batchCode)).toBe(true);
    }
  });

  it('covers all 33 Telangana districts in the reference list', () => {
    expect(DISTRICTS).toHaveLength(33);
  });
});
