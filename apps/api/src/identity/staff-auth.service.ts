import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { normalizePhone } from '../common/phone.js';
import { PiiCryptoService } from '../common/pii-crypto.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RedisService } from '../infra/redis.service.js';
import type { DeviceDto } from './dto/auth.dto.js';
import { OtpService, OTP_TTL_SECONDS } from './otp.service.js';
import { dummyPasswordHash, verifyPassword } from './passwords.js';
import { TokenService, type TokenPair } from './token.service.js';

export const MAX_PASSWORD_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;

/**
 * Staff sign-in, two factors (NFR-10): password, then an OTP to the staff member's phone.
 * Wrong phone and wrong password give the same answer; 5 wrong passwords lock the account.
 */
@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: PiiCryptoService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(phoneInput: string, password: string, ip: string) {
    const e164 = normalizePhone(phoneInput);
    const user = e164
      ? await this.prisma.db.user.findUnique({
          where: { phoneHmac: this.crypto.hmac(e164) },
          include: { credential: true },
        })
      : null;
    const credential =
      user?.role !== 'learner' && user?.status === 'active' ? user.credential : null;

    if (!user || !credential) {
      await verifyPassword(await dummyPasswordHash(), password);
      await this.audit.record({
        action: 'staff_login',
        outcome: 'failure:invalid_credentials',
        ip,
      });
      throw new ApiError(401, 'invalid_credentials');
    }
    const actor = { actorId: user.id, actorRole: user.role, ip };
    if (credential.lockedUntil && credential.lockedUntil > new Date()) {
      await this.audit.record({
        ...actor,
        action: 'staff_login',
        outcome: 'failure:account_locked',
      });
      throw new ApiError(423, 'account_locked', {
        retryAfterSeconds: secondsUntil(credential.lockedUntil),
      });
    }
    if (!(await verifyPassword(credential.passwordHash, password))) {
      const failures = credential.failedAttempts + 1;
      const locked = failures >= MAX_PASSWORD_FAILURES;
      await this.prisma.db.staffCredential.update({
        where: { userId: user.id },
        data: {
          failedAttempts: locked ? 0 : failures,
          lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
        },
      });
      await this.audit.record({
        ...actor,
        action: 'staff_login',
        outcome: locked ? 'failure:locked_now' : 'failure:invalid_credentials',
      });
      throw new ApiError(401, 'invalid_credentials');
    }

    await this.prisma.db.staffCredential.update({
      where: { userId: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    const sent = await this.otp.request(this.crypto.decrypt(user.phoneEnc), user.uiLocale, ip);
    const challengeToken = randomBytes(32).toString('base64url');
    await (
      await this.redis.connected()
    ).set(challengeKey(challengeToken), user.id, 'EX', OTP_TTL_SECONDS);
    await this.audit.record({ ...actor, action: 'staff_login_password', outcome: 'success' });
    return { challengeToken, ...sent };
  }

  async verify(
    challengeToken: string,
    code: string,
    device: DeviceDto,
    ip: string,
  ): Promise<{ tokens: TokenPair; userId: string }> {
    const redis = await this.redis.connected();
    const userId = await redis.get(challengeKey(challengeToken));
    if (!userId) throw new ApiError(401, 'challenge_expired');
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });
    const actor = { actorId: user.id, actorRole: user.role, ip };
    try {
      await this.otp.verify(this.crypto.decrypt(user.phoneEnc), code);
    } catch (err) {
      await this.audit.record({
        ...actor,
        action: 'staff_login_otp',
        outcome: `failure:${err instanceof ApiError ? err.code : 'error'}`,
      });
      throw err;
    }
    await redis.del(challengeKey(challengeToken));
    const deviceRow = await this.prisma.db.device.upsert({
      where: { userId_clientId: { userId, clientId: device.clientId } },
      create: {
        userId,
        clientId: device.clientId,
        platform: device.platform,
        appVersion: device.appVersion,
      },
      update: { lastSeenAt: new Date(), appVersion: device.appVersion },
    });
    await this.prisma.db.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
    const tokens = await this.tokens.issue({ userId, role: user.role, deviceId: deviceRow.id });
    await this.audit.record({ ...actor, action: 'staff_login', outcome: 'success' });
    return { tokens, userId };
  }
}

const challengeKey = (t: string) =>
  `staff-challenge:${createHash('sha256').update(t).digest('base64url')}`;
const secondsUntil = (d: Date) => Math.max(1, Math.ceil((d.getTime() - Date.now()) / 1000));
