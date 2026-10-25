import { randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SMS_PROVIDER, type SmsProvider } from '../adapters/sms/sms.provider.js';
import { ApiError } from '../common/api-error.js';
import { isSyntheticPhone, normalizePhone } from '../common/phone.js';
import { PiiCryptoService } from '../common/pii-crypto.service.js';
import { RateLimiterService } from '../common/rate-limiter.service.js';
import { ENV, isProduction, type Env } from '../config/env.js';
import { RedisService } from '../infra/redis.service.js';

export const OTP_TTL_SECONDS = 300;
export const OTP_RESEND_AFTER_SECONDS = 30;
export const OTP_MAX_ATTEMPTS = 5;
// NFR-10 rate limits. Moved to admin settings with FR-1101 (step 3).
const PER_PHONE = { name: 'otp-phone', max: 5, windowSeconds: 3600 };
const PER_IP = { name: 'otp-ip', max: 30, windowSeconds: 3600 };

export interface VerifiedPhone {
  e164: string;
  phoneHmac: string;
}

/**
 * One-time passwords for login (FR-101). Codes live only in Redis, hashed, for 5 minutes.
 * Synthetic +9155… numbers get DEV_OTP outside production and never trigger an SMS.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly crypto: PiiCryptoService,
    private readonly redis: RedisService,
    private readonly limiter: RateLimiterService,
  ) {}

  async request(phoneInput: string, locale: string, clientIp: string) {
    const e164 = this.parsePhone(phoneInput);
    const phoneHmac = this.crypto.hmac(e164);
    await this.limiter.hit(PER_IP, clientIp);
    await this.limiter.hit(PER_PHONE, phoneHmac);

    const redis = await this.redis.connected();
    const cooldownKey = `otp-cooldown:${phoneHmac}`;
    if ((await redis.set(cooldownKey, '1', 'EX', OTP_RESEND_AFTER_SECONDS, 'NX')) === null) {
      throw new ApiError(429, 'otp_resend_too_soon', {
        retryAfterSeconds: Math.max(await redis.ttl(cooldownKey), 1),
      });
    }

    const synthetic = isSyntheticPhone(e164);
    const code = synthetic ? this.env.DEV_OTP : String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otpKey = `otp:${phoneHmac}`;
    await redis
      .multi()
      .del(otpKey)
      .hset(otpKey, { hash: this.hash(phoneHmac, code), attempts: 0 })
      .expire(otpKey, OTP_TTL_SECONDS)
      .exec();

    if (!synthetic) {
      try {
        await this.sms.sendOtp(e164, code, locale);
      } catch (err) {
        await redis.del(otpKey, cooldownKey);
        throw err;
      }
    }
    return { expiresInSeconds: OTP_TTL_SECONDS, resendAfterSeconds: OTP_RESEND_AFTER_SECONDS };
  }

  /** Checks the code once; the code is consumed on success. */
  async verify(phoneInput: string, code: string): Promise<VerifiedPhone> {
    const e164 = this.parsePhone(phoneInput);
    const phoneHmac = this.crypto.hmac(e164);
    const redis = await this.redis.connected();
    const otpKey = `otp:${phoneHmac}`;

    const stored = await redis.hget(otpKey, 'hash');
    if (!stored) throw new ApiError(400, 'otp_invalid');
    const attempts = await redis.hincrby(otpKey, 'attempts', 1);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await redis.del(otpKey);
      throw new ApiError(429, 'otp_attempts_exceeded');
    }
    const given = Buffer.from(this.hash(phoneHmac, code));
    const expected = Buffer.from(stored);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new ApiError(400, 'otp_invalid', { attemptsLeft: OTP_MAX_ATTEMPTS - attempts });
    }
    await redis.del(otpKey);
    return { e164, phoneHmac };
  }

  private parsePhone(input: string): string {
    const e164 = normalizePhone(input);
    if (!e164 || (isSyntheticPhone(e164) && isProduction(this.env))) {
      throw new ApiError(400, 'invalid_phone');
    }
    return e164;
  }

  private hash(phoneHmac: string, code: string): string {
    return this.crypto.hmac(`otp:${phoneHmac}:${code}`);
  }
}
