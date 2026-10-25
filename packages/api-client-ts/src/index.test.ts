import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index';

describe('createApiClient', () => {
  it('calls typed paths under the given base URL', async () => {
    const fetchMock = vi.fn(async () => Response.json({ status: 'ok' }));
    const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchMock });
    const { data } = await client.GET('/v1/health/live');
    expect(data?.status).toBe('ok');
    const request = (fetchMock.mock.calls[0] as unknown as [Request])[0];
    expect(request.url).toBe('http://api.test/v1/health/live');
  });
});
