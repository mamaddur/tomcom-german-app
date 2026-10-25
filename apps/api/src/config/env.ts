import { z } from 'zod';

const base64Key = (minBytes: number) =>
  z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length >= minBytes,
      `must be base64 of at least ${minBytes} bytes`,
    );

const envSchema = z
  .object({
    APP_ENV: z.enum(['dev', 'test', 'staging', 'prod']).default('dev'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    /** AES-256-GCM key for phone numbers and other encrypted PII. Exactly 32 bytes. */
    PII_ENCRYPTION_KEY: base64Key(32).refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'must be 32 bytes',
    ),
    /** HMAC key for lookups on encrypted fields (phone). */
    PII_HMAC_KEY: base64Key(32),
    /** HS256 signing key for access tokens. */
    JWT_SECRET: base64Key(32),
    /** Fixed OTP for synthetic +9155… numbers outside production. No SMS is sent for them. */
    DEV_OTP: z
      .string()
      .regex(/^\d{6}$/)
      .default('123456'),
    /** SMS gateway for real numbers. `none` rejects real numbers (dev without a key). */
    SMS_PROVIDER: z.enum(['none']).default('none'),
  })
  .refine((e) => e.APP_ENV !== 'prod' || e.SMS_PROVIDER !== 'none', {
    message: 'production needs an SMS provider',
    path: ['SMS_PROVIDER'],
  });

export type Env = z.infer<typeof envSchema>;

/** Fails fast at boot with the names (never the values) of invalid variables. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  return parsed.data;
}

export const isProduction = (env: Env): boolean => env.APP_ENV === 'prod';

export const ENV = Symbol('ENV');
