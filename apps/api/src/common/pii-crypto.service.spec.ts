import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.js';
import { PiiCryptoService } from './pii-crypto.service.js';

const crypto = new PiiCryptoService(loadEnv());

describe('PiiCryptoService', () => {
  it('round-trips and never stores the plaintext', () => {
    const blob = crypto.encrypt('+919876543210');
    expect(blob.toString('latin1')).not.toContain('9876543210');
    expect(crypto.decrypt(blob)).toBe('+919876543210');
  });

  it('uses a fresh IV each time', () => {
    expect(crypto.encrypt('x').equals(crypto.encrypt('x'))).toBe(false);
  });

  it('detects tampering', () => {
    const blob = crypto.encrypt('+919876543210');
    blob[blob.length - 1]! ^= 1;
    expect(() => crypto.decrypt(blob)).toThrow();
  });

  it('rejects truncated ciphertext', () => {
    expect(() => crypto.decrypt(crypto.encrypt('+919876543210').subarray(0, 20))).toThrow(
      /too short/,
    );
  });

  it('gives a stable HMAC for lookups', () => {
    expect(crypto.hmac('+919876543210')).toBe(crypto.hmac('+919876543210'));
    expect(crypto.hmac('+919876543210')).not.toBe(crypto.hmac('+919876543211'));
  });
});
