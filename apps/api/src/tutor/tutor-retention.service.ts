import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { TutorService } from './tutor.service.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * NFR-15: deletes tutor conversations after 90 days. Runs hourly in every API instance (the delete
 * is idempotent); it moves to the worker process with BullMQ once that exists.
 */
@Injectable()
export class TutorRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TutorRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly tutor: TutorService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.APP_ENV === 'test') return;
    this.timer = setInterval(() => void this.run(), HOUR_MS);
    this.timer.unref();
    void this.run();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      const count = await this.tutor.purge();
      if (count > 0) this.log.log(`Deleted ${count} tutor messages past retention`);
    } catch {
      this.log.warn('Tutor retention purge failed; will retry next hour');
    }
  }
}
