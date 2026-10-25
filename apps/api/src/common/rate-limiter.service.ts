import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../infra/redis.service.js';
import { ApiError } from './api-error.js';

export interface Limit {
  /** Namespace, e.g. "otp-request-phone". */
  name: string;
  max: number;
  windowSeconds: number;
}

/** Fixed-window counters in Redis. Keys are hashed, so no identifier is stored in clear. */
@Injectable()
export class RateLimiterService {
  constructor(private readonly redis: RedisService) {}

  /** Counts one hit; throws 429 `rate_limited` with `retryAfterSeconds` once over the limit. */
  async hit(limit: Limit, subject: string): Promise<void> {
    const key = `rl:${limit.name}:${createHash('sha256').update(subject).digest('base64url')}`;
    const client = await this.redis.connected();
    const [[, count], [, ttl]] = (await client.multi().incr(key).ttl(key).exec()) as [
      [null, number],
      [null, number],
    ];
    if (ttl < 0) await client.expire(key, limit.windowSeconds);
    if (count > limit.max) {
      throw new ApiError(429, 'rate_limited', {
        retryAfterSeconds: ttl > 0 ? ttl : limit.windowSeconds,
      });
    }
  }
}
