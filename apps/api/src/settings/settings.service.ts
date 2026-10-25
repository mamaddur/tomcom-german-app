import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AccessClaims } from '../identity/token.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import {
  FEATURE_FLAGS,
  SETTINGS,
  type FeatureKey,
  type SettingKey,
  type SettingValue,
} from './registry.js';

const CACHE_MS = 10_000;

/** FR-1101 settings and FR-1103 feature flags: defaults in code, overrides in the database. */
@Injectable()
export class SettingsService {
  private cache: {
    at: number;
    settings: Map<string, unknown>;
    flags: Map<string, boolean>;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const { settings } = await this.load();
    return (settings.has(key) ? settings.get(key) : SETTINGS[key].default) as SettingValue<K>;
  }

  async isEnabled(key: FeatureKey): Promise<boolean> {
    const { flags } = await this.load();
    return flags.get(key) ?? FEATURE_FLAGS[key].default;
  }

  async listSettings() {
    const { settings } = await this.load();
    return (Object.keys(SETTINGS) as SettingKey[]).map((key) => ({
      key,
      value: settings.has(key) ? settings.get(key) : SETTINGS[key].default,
      default: SETTINGS[key].default as unknown,
      description: SETTINGS[key].description,
    }));
  }

  async listFlags() {
    const { flags } = await this.load();
    return (Object.keys(FEATURE_FLAGS) as FeatureKey[]).map((key) => ({
      key,
      enabled: flags.get(key) ?? FEATURE_FLAGS[key].default,
      default: FEATURE_FLAGS[key].default as boolean,
      description: FEATURE_FLAGS[key].description,
    }));
  }

  async setSetting(key: string, value: unknown, auth: AccessClaims, ip?: string) {
    if (!(key in SETTINGS)) throw new ApiError(404, 'setting_not_found');
    const def = SETTINGS[key as SettingKey];
    const parsed = def.schema.safeParse(value);
    if (!parsed.success) throw new ApiError(400, 'setting_value_invalid', { key });
    const before = await this.get(key as SettingKey);
    await this.prisma.db.setting.upsert({
      where: { key },
      create: { key, value: parsed.data as Prisma.InputJsonValue, updatedBy: auth.userId },
      update: { value: parsed.data as Prisma.InputJsonValue, updatedBy: auth.userId },
    });
    this.cache = null;
    // Settings hold no personal data, so old and new values go in the audit log.
    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'setting_change',
      entityType: 'setting',
      entityId: key,
      outcome: 'success',
      details: { before, after: parsed.data },
      ip,
    });
    return (await this.listSettings()).find((s) => s.key === key)!;
  }

  async setFlag(key: string, enabled: boolean, auth: AccessClaims, ip?: string) {
    if (!(key in FEATURE_FLAGS)) throw new ApiError(404, 'feature_flag_not_found');
    const before = await this.isEnabled(key as FeatureKey);
    await this.prisma.db.featureFlag.upsert({
      where: { key },
      create: { key, enabled, updatedBy: auth.userId },
      update: { enabled, updatedBy: auth.userId },
    });
    this.cache = null;
    await this.audit.record({
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'feature_flag_change',
      entityType: 'feature_flag',
      entityId: key,
      outcome: 'success',
      details: { before, after: enabled },
      ip,
    });
    return (await this.listFlags()).find((f) => f.key === key)!;
  }

  private async load() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache;
    const [settings, flags] = await Promise.all([
      this.prisma.db.setting.findMany(),
      this.prisma.db.featureFlag.findMany(),
    ]);
    this.cache = {
      at: Date.now(),
      settings: new Map(settings.map((s) => [s.key, s.value as unknown])),
      flags: new Map(flags.map((f) => [f.key, f.enabled])),
    };
    return this.cache;
  }
}
