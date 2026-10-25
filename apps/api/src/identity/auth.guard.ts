import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiError } from '../common/api-error.js';
import { TokenService, type AccessClaims } from './token.service.js';

const IS_PUBLIC = 'isPublic';
/** Marks a route as reachable without a token. Everything else requires one (deny by default). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export type AuthedRequest = Request & { auth?: AccessClaims };

/** The signed-in caller, set by AuthGuard. */
export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AccessClaims => {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new ApiError(401, 'unauthorized');
  return auth;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new ApiError(401, 'unauthorized');
    req.auth = await this.tokens.verifyAccess(token);
    return true;
  }
}
