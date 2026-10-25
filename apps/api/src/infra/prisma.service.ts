import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV, type Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/** Owns the Prisma client. Modules use `prisma.db` and only touch the tables they own. */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    // Query logging stays off: parameters can contain PII.
    this.db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
      log: ['warn', 'error'],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
