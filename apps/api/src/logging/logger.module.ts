import { randomUUID } from 'node:crypto';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv } from '../config/env';
import { redactPii, scrubText } from './redact';
import { redactingOptions } from './pino-options';

/**
 * Structured JSON logs with PII stripped before serialisation.
 * Request logs carry method, path (query string dropped) and status only — never headers or bodies.
 */
export function createLoggerModule() {
  const env = loadEnv();
  return PinoLoggerModule.forRoot({
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: (req: IncomingMessage) => {
        const incoming = req.headers['x-request-id'];
        return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
          ? incoming
          : randomUUID();
      },
      serializers: {
        req: (req: IncomingMessage & { id?: string }) => ({
          id: req.id,
          method: req.method,
          path: scrubText((req.url ?? '').split('?')[0] ?? ''),
        }),
        // pino-http passes a wrapped response; the live object is on `raw`.
        res: (res: { raw?: ServerResponse; statusCode?: number | null }) => ({
          statusCode: res.raw?.statusCode ?? res.statusCode,
        }),
        err: (err: Error) => redactPii(err),
      },
      ...redactingOptions,
      transport:
        env.APP_ENV === 'dev'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  });
}
