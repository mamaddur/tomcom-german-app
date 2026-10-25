import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './app.factory.js';

describe('health (stubbed dependencies)', () => {
  let app: INestApplication;
  const queryRaw = vi.fn();
  const prisma = { db: { $queryRaw: queryRaw } };
  const redis = { ping: vi.fn() };

  beforeAll(async () => {
    app = await createTestApp({ prisma, redis });
  });
  afterAll(() => app.close());

  it('GET /v1/health/live is always ok', async () => {
    await request(app.getHttpServer()).get('/v1/health/live').expect(200, { status: 'ok' });
  });

  it('GET /v1/health/ready is ok when database and redis are up', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue(true);
    const res = await request(app.getHttpServer()).get('/v1/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('GET /v1/health/ready is 503 and names the failing dependency', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    redis.ping.mockResolvedValue(true);
    const res = await request(app.getHttpServer()).get('/v1/health/ready').expect(503);
    expect(res.body).toEqual({ status: 'error', checks: { database: 'down', redis: 'up' } });
  });

  it('sets security headers (NFR-09)', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
