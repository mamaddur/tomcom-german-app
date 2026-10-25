import type { LoggerOptions } from 'pino';
import { redactPii, scrubText } from './redact.js';

/** The redaction part of the pino config, shared by the HTTP logger and any standalone logger. */
export const redactingOptions: Pick<LoggerOptions, 'formatters' | 'hooks'> = {
  formatters: {
    log: (obj: Record<string, unknown>) => redactPii(obj) as Record<string, unknown>,
  },
  hooks: {
    logMethod(args, method) {
      const scrubbed = args.map((a) => (typeof a === 'string' ? scrubText(a) : a));
      return method.apply(this, scrubbed as Parameters<typeof method>);
    },
  },
};
