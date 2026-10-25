import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { ApiError } from '../common/api-error.js';
import { ENV, type Env } from '../config/env.js';
import type { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma.service.js';

export const ACCESS_TTL_SECONDS = 15 * 60;
/** Learners stay signed in on their own phone; staff sessions are handled in step 2c. */
export const LEARNER_REFRESH_TTL_DAYS = 60;
const ISSUER = 'tomcom-api';
const AUDIENCE = 'tomcom';

export interface AccessClaims {
  userId: string;
  role: Role;
  deviceId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  tokenType: 'Bearer';
}

/** Short-lived JWT access tokens + opaque refresh tokens with rotation and reuse detection (NFR-10). */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.key = new Uint8Array(Buffer.from(env.JWT_SECRET, 'base64'));
  }

  async issue(claims: AccessClaims, familyId: string = randomUUID()): Promise<TokenPair> {
    return (await this.issueWithId(claims, familyId)).pair;
  }

  private async issueWithId(claims: AccessClaims, familyId: string) {
    const refreshToken = randomBytes(32).toString('base64url');
    const row = await this.prisma.db.refreshToken.create({
      data: {
        userId: claims.userId,
        deviceId: claims.deviceId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + LEARNER_REFRESH_TTL_DAYS * 86_400_000),
      },
    });
    const pair: TokenPair = {
      accessToken: await this.signAccess(claims),
      refreshToken,
      expiresInSeconds: ACCESS_TTL_SECONDS,
      tokenType: 'Bearer',
    };
    return { pair, id: row.id };
  }

  /** Exchanges a refresh token for a new pair. Presenting a used token revokes its whole family. */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const db = this.prisma.db;
    const current = await db.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { role: true, status: true } } },
    });
    if (!current) throw new ApiError(401, 'refresh_invalid');
    if (current.revokedAt) {
      await this.revokeFamily(current.familyId);
      throw new ApiError(401, 'refresh_reused');
    }
    if (current.expiresAt < new Date() || current.user.status !== 'active') {
      throw new ApiError(401, 'refresh_invalid');
    }
    // Conditional update: two concurrent refreshes with the same token cannot both win.
    const { count } = await db.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeFamily(current.familyId);
      throw new ApiError(401, 'refresh_reused');
    }
    const next = await this.issueWithId(
      { userId: current.userId, role: current.user.role, deviceId: current.deviceId },
      current.familyId,
    );
    await db.refreshToken.update({ where: { id: current.id }, data: { replacedBy: next.id } });
    return next.pair;
  }

  /** Signs out the device session that owns this token. Unknown tokens are ignored. */
  async revoke(refreshToken: string): Promise<void> {
    const row = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (row) await this.revokeFamily(row.familyId);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (payload.typ !== 'access' || typeof payload.sub !== 'string')
        throw new Error('wrong token type');
      return { userId: payload.sub, role: payload.role as Role, deviceId: payload.did as string };
    } catch {
      throw new ApiError(401, 'access_token_invalid');
    }
  }

  private signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ typ: 'access', role: claims.role, did: claims.deviceId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .sign(this.key);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('base64url');
