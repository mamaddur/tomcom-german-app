import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  /** The client, connecting on first use. */
  async connected(): Promise<Redis> {
    if (this.client.status === 'wait') await this.client.connect();
    return this.client;
  }

  async ping(): Promise<boolean> {
    return (await (await this.connected()).ping()) === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
