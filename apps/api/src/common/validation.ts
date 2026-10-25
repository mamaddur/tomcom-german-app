import { ValidationError, ValidationPipe } from '@nestjs/common';
import { ApiError } from './api-error.js';

/**
 * Request validation. Unknown fields are rejected. The error lists field names and failed
 * constraint names only, never the submitted values (they may be phone numbers or OTPs).
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new ApiError(400, 'validation_failed', { fields: flatten(errors) }),
  });
}

function flatten(
  errors: ValidationError[],
  prefix = '',
): Array<{ field: string; rules: string[] }> {
  return errors.flatMap((e) => {
    const field = prefix ? `${prefix}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, rules: Object.keys(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}
