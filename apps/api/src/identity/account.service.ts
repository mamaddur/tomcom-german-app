import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { PiiCryptoService } from '../common/pii-crypto.service.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RedisService } from '../infra/redis.service.js';
import { ConsentService } from './consent.service.js';
import type { DeviceDto, RegisterDto } from './dto/auth.dto.js';
import type { VerifiedPhone } from './otp.service.js';
import { TokenService, type TokenPair } from './token.service.js';

export const REGISTRATION_TTL_SECONDS = 15 * 60;

export type SignInResult =
  | { status: 'authenticated'; tokens: TokenPair; user: User }
  | {
      status: 'registration_required';
      registrationToken: string;
      registrationExpiresInSeconds: number;
    };

/**
 * Sign-in and consent-first registration (FR-101, FR-104, FR-107).
 *
 * A verified phone that has no account gets a registration token. The phone is held encrypted
 * in Redis for 15 minutes; nothing is written to the database until `register`, which stores the
 * user and the consent record in one transaction (story 1: consent before any personal data).
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: PiiCryptoService,
    private readonly consent: ConsentService,
    private readonly tokens: TokenService,
  ) {}

  async signIn(phone: VerifiedPhone, device: DeviceDto): Promise<SignInResult> {
    const user = await this.prisma.db.user.findUnique({ where: { phoneHmac: phone.phoneHmac } });
    if (user && user.status === 'active') {
      const deviceId = await this.upsertDevice(user.id, device);
      await this.prisma.db.user.update({
        where: { id: user.id },
        data: { lastSeenAt: new Date() },
      });
      const tokens = await this.tokens.issue({ userId: user.id, role: user.role, deviceId });
      return { status: 'authenticated', tokens, user };
    }
    if (user) throw new ApiError(403, 'account_not_active');

    const registrationToken = randomBytes(32).toString('base64url');
    const redis = await this.redis.connected();
    await redis.set(
      registrationKey(registrationToken),
      JSON.stringify({
        phoneEnc: this.crypto.encrypt(phone.e164).toString('base64'),
        phoneHmac: phone.phoneHmac,
      }),
      'EX',
      REGISTRATION_TTL_SECONDS,
    );
    return {
      status: 'registration_required',
      registrationToken,
      registrationExpiresInSeconds: REGISTRATION_TTL_SECONDS,
    };
  }

  async register(dto: RegisterDto): Promise<{ tokens: TokenPair; user: User }> {
    const notice = await this.consent.assertAcceptable(
      dto.consent.noticeVersion,
      dto.consent.purposes,
    );
    const redis = await this.redis.connected();
    // GETDEL: a registration token works exactly once.
    const raw = await redis.getdel(registrationKey(dto.registrationToken));
    if (!raw) throw new ApiError(401, 'registration_expired');
    const pending = JSON.parse(raw) as { phoneEnc: string; phoneHmac: string };

    try {
      const { user, deviceId } = await this.prisma.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            role: 'learner',
            phoneEnc: new Uint8Array(Buffer.from(pending.phoneEnc, 'base64')),
            phoneHmac: pending.phoneHmac,
            uiLocale: dto.locale,
            lastSeenAt: new Date(),
          },
        });
        const device = await tx.device.create({
          data: {
            userId: user.id,
            clientId: dto.device.clientId,
            platform: dto.device.platform,
            appVersion: dto.device.appVersion,
          },
        });
        await tx.consent.create({
          data: {
            userId: user.id,
            noticeVersion: notice.version,
            purposes: dto.consent.purposes,
            locale: dto.locale,
            deviceId: device.id,
          },
        });
        return { user, deviceId: device.id };
      });
      const tokens = await this.tokens.issue({ userId: user.id, role: user.role, deviceId });
      return { tokens, user };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError(409, 'already_registered');
      }
      throw err;
    }
  }

  private async upsertDevice(userId: string, device: DeviceDto): Promise<string> {
    const row = await this.prisma.db.device.upsert({
      where: { userId_clientId: { userId, clientId: device.clientId } },
      create: {
        userId,
        clientId: device.clientId,
        platform: device.platform,
        appVersion: device.appVersion,
      },
      update: { platform: device.platform, appVersion: device.appVersion, lastSeenAt: new Date() },
    });
    return row.id;
  }
}

const registrationKey = (token: string) =>
  `reg:${createHash('sha256').update(token).digest('base64url')}`;
