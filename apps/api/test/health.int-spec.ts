import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './app.factory';

describe('health (real Postgres and Redis)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('GET /v1/health/ready reports both dependencies up', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/ready').expect(200);
    expect(res.body.checks).toEqual({ database: 'up', redis: 'up' });
  });
});
