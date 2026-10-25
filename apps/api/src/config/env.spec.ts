import { loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:secret@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
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
});
