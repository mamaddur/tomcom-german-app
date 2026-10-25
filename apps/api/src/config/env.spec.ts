import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const key = Buffer.alloc(32, 7).toString('base64');
const valid = {
  DATABASE_URL: 'postgresql://u:secret@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  PII_ENCRYPTION_KEY: key,
  PII_HMAC_KEY: key,
  JWT_SECRET: key,
  S3_BUCKET: 'tomcom-test',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(valid)).toMatchObject({ APP_ENV: 'dev', PORT: 3000, LOG_LEVEL: 'info' });
  });

  it('names invalid variables without echoing their values', () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: 'not a url with secret' })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => loadEnv({ ...valid, DATABASE_URL: 'not a url with secret' })).not.toThrow(
      /secret/,
    );
  });

  it('rejects short keys', () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: Buffer.alloc(8).toString('base64') })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('refuses to run production without an SMS provider', () => {
    expect(() => loadEnv({ ...valid, APP_ENV: 'prod' })).toThrow(/SMS_PROVIDER/);
  });
});
