import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

const VERSION = 1;

/**
 * Application-level encryption for PII columns (NFR-09, NFR-13).
 * Ciphertext layout: [version:1][iv:12][tag:16][data]. In production the key comes from the
 * cloud KMS/vault through the environment; rotation adds a new version byte.
 */
@Injectable()
export class PiiCryptoService {
  private readonly key: Buffer;
  private readonly hmacKey: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = Buffer.from(env.PII_ENCRYPTION_KEY, 'base64');
    this.hmacKey = Buffer.from(env.PII_HMAC_KEY, 'base64');
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), data]);
  }

  decrypt(blob: Uint8Array): string {
    const buf = Buffer.from(blob);
    if (buf[0] !== VERSION) throw new Error('Unknown PII ciphertext version');
    const decipher = createDecipheriv('aes-256-gcm', this.key, buf.subarray(1, 13));
    decipher.setAuthTag(buf.subarray(13, 29));
    return Buffer.concat([decipher.update(buf.subarray(29)), decipher.final()]).toString('utf8');
  }

  /** Deterministic keyed hash for equality lookups (e.g. find user by phone). */
  hmac(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value).digest('base64url');
  }
}
