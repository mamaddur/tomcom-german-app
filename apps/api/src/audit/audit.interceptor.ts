import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, from, map, mergeMap, Observable, throwError } from 'rxjs';
import { ApiError } from '../common/api-error.js';
import type { AuthedRequest } from '../identity/auth.guard.js';
import { AuditService } from './audit.service.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Records every state-changing request made by staff (NFR-11 "every admin action in the audit
 * log"). Stores method, route pattern, route parameters and outcome — never the body.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const auth = req.auth;
    if (!auth || auth.role === 'learner' || !MUTATING.has(req.method)) return next.handle();

    const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
    const base = {
      actorId: auth.userId,
      actorRole: auth.role,
      action: `${req.method} ${route}`,
      entityId: typeof req.params.id === 'string' ? req.params.id : undefined,
      details: Object.keys(req.params).length ? { params: req.params } : undefined,
      ip: req.ip,
    };
    // The entry is written before the response goes out: a success the caller sees is always on record.
    return next.handle().pipe(
      mergeMap((value) =>
        from(this.audit.record({ ...base, outcome: 'success' })).pipe(map(() => value)),
      ),
      catchError((err: unknown) =>
        from(this.audit.record({ ...base, outcome: `failure:${errorCode(err)}` })).pipe(
          mergeMap(() => throwError(() => err)),
        ),
      ),
    );
  }
}

function errorCode(err: unknown): string {
  if (err instanceof ApiError) return err.code;
  if (err instanceof HttpException) return String(err.getStatus());
  return 'internal_error';
}
