import { HttpException } from '@nestjs/common';

/**
 * Errors the apps can act on. `code` is stable and localised by the apps; `detail` is for
 * developers and must never contain PII.
 */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super({ code, ...extra }, status);
  }
}
