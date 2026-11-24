import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiKeyRecord } from '../interfaces/auth.interface';

interface StoredApiKey {
  digest: Buffer;
  record: ApiKeyRecord;
}

@Injectable()
export class ApiKeyService {
  private readonly keys: StoredApiKey[];
  private readonly requireApiKey: boolean;

  constructor(private readonly configService: ConfigService) {
    const rawKeys =
      this.configService.get<string>('API_KEYS') ??
      this.configService.get<string>('GATEWAY_API_KEYS') ??
      '';
    this.keys = this.parseApiKeys(rawKeys);
    this.requireApiKey =
      (this.configService.get<string>('REQUIRE_API_KEY') ?? '').toLowerCase() ===
      'true';
  }

  isRequiredByDefault(): boolean {
    return this.requireApiKey;
  }

  hasConfiguredKeys(): boolean {
    return this.keys.length > 0;
  }

  validateApiKey(rawKey: string): ApiKeyRecord {
    const candidate = rawKey.trim();
    if (!candidate || this.keys.length === 0) {
      throw new UnauthorizedException('API Key inválida');
    }

    const candidateDigest = this.digestKey(candidate);
    let matched: ApiKeyRecord | undefined;

    for (const entry of this.keys) {
      if (timingSafeEqual(entry.digest, candidateDigest)) {
        matched = entry.record;
      }
    }

    if (!matched) {
      throw new UnauthorizedException('API Key inválida');
    }

    if (!matched.active) {
      throw new UnauthorizedException('API Key inactiva');
    }

    return matched;
  }

  private digestKey(key: string): Buffer {
    return createHash('sha256').update(key, 'utf8').digest();
  }

  private parseApiKeys(raw: string): StoredApiKey[] {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[')) {
      return this.parseJsonApiKeys(trimmed);
    }

    return trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const parts = entry.split(':').map((part) => part.trim());
        const key = parts[0];
        const name = parts[1] || 'default';
        const activeToken = (parts[2] ?? 'true').toLowerCase();
        const active =
          activeToken !== 'false' &&
          activeToken !== '0' &&
          activeToken !== 'inactive';

        const record: ApiKeyRecord = {
          key,
          name,
          active,
          role: 'service',
          roles: ['service'],
        };

        return {
          digest: this.digestKey(key),
          record,
        };
      });
  }

  private parseJsonApiKeys(raw: string): StoredApiKey[] {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      const result: StoredApiKey[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const candidate = item as Partial<ApiKeyRecord>;
        if (typeof candidate.key !== 'string' || !candidate.key.trim()) {
          continue;
        }
        const key = candidate.key.trim();
        const role =
          typeof candidate.role === 'string' && candidate.role.trim()
            ? candidate.role.trim()
            : 'service';
        const roles = Array.isArray(candidate.roles)
          ? candidate.roles.filter((r): r is string => typeof r === 'string')
          : [role];
        const scopes = Array.isArray(candidate.scopes)
          ? candidate.scopes.filter((s): s is string => typeof s === 'string')
          : [];

        result.push({
          digest: this.digestKey(key),
          record: {
            key,
            name:
              typeof candidate.name === 'string' && candidate.name.trim()
                ? candidate.name.trim()
                : 'api-key',
            active: candidate.active ?? true,
            role,
            roles,
            scopes,
            tenantId:
              typeof candidate.tenantId === 'string' &&
              candidate.tenantId.trim()
                ? candidate.tenantId.trim()
                : undefined,
            userId:
              candidate.userId !== undefined && candidate.userId !== null
                ? String(candidate.userId).trim()
                : undefined,
          },
        });
      }
      return result;
    } catch {
      return [];
    }
  }
}
