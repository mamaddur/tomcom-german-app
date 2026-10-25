import { describe, expect, it } from 'vitest';
import { isSyntheticPhone, normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['(+91) 6000000000', '+916000000000'],
    ['+915500000002', '+915500000002'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['12345', '+14155550100', '5123456789', '+919876', '+91987654321012', 'abc'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it('only treats the +9155 range as synthetic', () => {
    expect(isSyntheticPhone('+915500000002')).toBe(true);
    expect(isSyntheticPhone('+919876543210')).toBe(false);
  });
});
