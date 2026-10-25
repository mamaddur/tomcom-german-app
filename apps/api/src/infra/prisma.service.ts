import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    // Query logging stays off: parameters can contain PII.
    super({ log: ['warn', 'error'] });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
