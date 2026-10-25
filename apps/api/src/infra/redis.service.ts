import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV, type Env } from '../config/env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async ping(): Promise<boolean> {
    if (this.client.status === 'wait') await this.client.connect();
    return (await this.client.ping()) === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
