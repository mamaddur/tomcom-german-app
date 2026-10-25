import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from './api-error.js';

/** Every error leaves the API as application/problem+json with a stable `code` (RFC 9457). */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toProblem(exception);
    // Deliberate errors (ApiError/HttpException) are expected outcomes; only crashes are logged.
    if (!(exception instanceof HttpException)) this.logger.error(exception);
    res.status(status).type('application/problem+json').json(body);
  }

  private toProblem(exception: unknown): { status: number; body: Record<string, unknown> } {
    if (exception instanceof ApiError) {
      const status = exception.getStatus();
      return {
        status,
        body: { status, title: exception.code, code: exception.code, ...exception.extra },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      // Keep payloads that controllers built deliberately (e.g. readiness checks).
      if (typeof response === 'object' && response !== null && !('message' in response)) {
        return { status, body: { code: defaultCode(status), ...response } };
      }
      return { status, body: { status, title: defaultCode(status), code: defaultCode(status) } };
    }
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    return { status, body: { status, title: 'internal_error', code: 'internal_error' } };
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 413:
      return 'file_too_large';
    case 415:
      return 'unsupported_media';
    case 429:
      return 'rate_limited';
    case 503:
      return 'unavailable';
    default:
      return status >= 500 ? 'internal_error' : 'error';
  }
}
