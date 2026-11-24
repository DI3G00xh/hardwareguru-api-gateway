import { HttpService } from '@nestjs/axios';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JWK,
  type JWTPayload,
} from 'jose';
import { firstValueFrom, timeout } from 'rxjs';
import type { AuthenticatedUser } from '../interfaces/auth.interface';

const SYMMETRIC_ALGS = new Set(['HS256', 'HS384', 'HS512']);
const ASYMMETRIC_ALGS = new Set([
  'RS256',
  'RS384',
  'RS512',
  'ES256',
  'ES384',
  'ES512',
  'PS256',
  'PS384',
  'PS512',
  'EdDSA',
]);
const DEFAULT_JWKS_TIMEOUT_MS = 5000;

interface CachedJwkEntry {
  key: CryptoKey | Uint8Array;
  alg?: string;
}

interface JwksCache {
  byKid: Map<string, CachedJwkEntry>;
  entries: CachedJwkEntry[];
}

@Injectable()
export class TokenVerifierService {
  private jwksCache: JwksCache | null = null;
  private jwksInFlight: Promise<JwksCache> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  clearJwksCache(): void {
    this.jwksCache = null;
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new UnauthorizedException('Token de autenticación requerido');
    }

    let alg: string | undefined;
    let kid: string | undefined;
    try {
      const header = decodeProtectedHeader(trimmed);
      alg = header.alg;
      kid = typeof header.kid === 'string' ? header.kid : undefined;
    } catch {
      throw new UnauthorizedException('Token inválido o malformado');
    }

    if (!alg || alg === 'none') {
      throw new UnauthorizedException('Algoritmo JWT no permitido');
    }

    const issuer = this.configService.get<string>('JWT_ISSUER')?.trim();
    const audience = this.configService.get<string>('JWT_AUDIENCE')?.trim();
    const verifyOptions = {
      algorithms: [alg],
      requiredClaims: ['exp'],
      ...(issuer ? { issuer } : {}),
      ...(audience ? { audience } : {}),
    };

    let payload: JWTPayload;
    if (SYMMETRIC_ALGS.has(alg)) {
      const secretKey = this.getSymmetricKey();
      try {
        const result = await jwtVerify(trimmed, secretKey, verifyOptions);
        payload = result.payload;
      } catch {
        throw new UnauthorizedException('Token inválido o expirado');
      }
    } else if (ASYMMETRIC_ALGS.has(alg)) {
      const publicKey = await this.getJwksPublicKey(kid, alg);
      try {
        const result = await jwtVerify(trimmed, publicKey, verifyOptions);
        payload = result.payload;
      } catch {
        throw new UnauthorizedException('Token inválido o expirado');
      }
    } else {
      throw new UnauthorizedException('Algoritmo JWT no soportado');
    }

    return this.mapPayloadToUser(payload);
  }

  private getSymmetricKey(): Uint8Array {
    const secret = this.configService.get<string>('JWT_SECRET')?.trim();
    if (!secret) {
      throw new UnauthorizedException('Configuración JWT_SECRET no disponible');
    }
    return new TextEncoder().encode(secret);
  }

  private async getJwksPublicKey(
    kid: string | undefined,
    alg: string,
  ): Promise<CryptoKey | Uint8Array> {
    const jwksUrl = this.getJwksUrl();
    if (!jwksUrl) {
      throw new UnauthorizedException('JWKS no configurado para validar token');
    }

    const cache = await this.loadJwksOnce(jwksUrl);
    if (kid) {
      const entry = cache.byKid.get(kid);
      if (!entry || (entry.alg && entry.alg !== alg)) {
        throw new UnauthorizedException('Clave pública JWKS no encontrada');
      }
      return entry.key;
    }

    if (cache.entries.length === 1) {
      const single = cache.entries[0];
      if (!single.alg || single.alg === alg) {
        return single.key;
      }
    }

    throw new UnauthorizedException('Clave pública JWKS ambigua o ausente');
  }

  private getJwksUrl(): string | undefined {
    const raw =
      this.configService.get<string>('AUTH_JWKS_URL') ??
      this.configService.get<string>('JWT_JWKS_URI');
    const trimmed = raw?.trim();
    return trimmed || undefined;
  }

  private async loadJwksOnce(jwksUrl: string): Promise<JwksCache> {
    if (this.jwksCache) {
      return this.jwksCache;
    }

    if (!this.jwksInFlight) {
      this.jwksInFlight = this.fetchAndCacheJwks(jwksUrl).finally(() => {
        this.jwksInFlight = null;
      });
    }

    return this.jwksInFlight;
  }

  private async fetchAndCacheJwks(jwksUrl: string): Promise<JwksCache> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .get<{ keys?: JWK[] }>(jwksUrl, {
            timeout: DEFAULT_JWKS_TIMEOUT_MS,
          })
          .pipe(timeout(DEFAULT_JWKS_TIMEOUT_MS)),
      );

      const rawKeys = response.data?.keys;
      if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
        throw new UnauthorizedException('JWKS sin claves públicas válidas');
      }

      const byKid = new Map<string, CachedJwkEntry>();
      const entries: CachedJwkEntry[] = [];

      for (const jwk of rawKeys) {
        if (!jwk || typeof jwk !== 'object') continue;
        if (jwk.use && jwk.use !== 'sig') continue;
        if (!jwk.alg) continue;

        const imported = await importJWK(jwk, jwk.alg);
        const entry: CachedJwkEntry = { key: imported, alg: jwk.alg };
        entries.push(entry);
        if (typeof jwk.kid === 'string' && jwk.kid.trim()) {
          byKid.set(jwk.kid.trim(), entry);
        }
      }

      if (entries.length === 0) {
        throw new UnauthorizedException('JWKS sin claves de firma válidas');
      }

      this.jwksCache = { byKid, entries };
      return this.jwksCache;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('No se pudo obtener JWKS del emisor');
    }
  }

  private mapPayloadToUser(payload: JWTPayload): AuthenticatedUser {
    const userId = this.toClaimString(
      payload.user_id ?? payload.userId ?? payload.sub,
    );
    if (!userId) {
      throw new UnauthorizedException('Token sin identificador de usuario');
    }

    const roles = this.extractRoles(payload);
    const scopes = this.extractScopes(payload);
    const tenantId = this.extractTenantId(payload);

    return {
      id: userId,
      sub: typeof payload.sub === 'string' ? payload.sub : userId,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role: roles[0] ?? 'user',
      roles: roles.length > 0 ? roles : ['user'],
      scopes,
      tenantId,
      authType: 'jwt',
    };
  }

  private toClaimString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private extractRoles(payload: JWTPayload): string[] {
    const collected = new Set<string>();

    if (typeof payload.role === 'string' && payload.role.trim()) {
      collected.add(payload.role.trim());
    }

    if (Array.isArray(payload.roles)) {
      for (const role of payload.roles) {
        if (typeof role === 'string' && role.trim()) {
          collected.add(role.trim());
        }
      }
    }

    const realmAccess = payload.realm_access as
      | { roles?: unknown }
      | undefined;
    if (Array.isArray(realmAccess?.roles)) {
      for (const role of realmAccess.roles) {
        if (typeof role === 'string' && role.trim()) {
          collected.add(role.trim());
        }
      }
    }

    return [...collected];
  }

  private extractScopes(payload: JWTPayload): string[] {
    const collected = new Set<string>();

    const addSpaceDelimited = (value: unknown) => {
      if (typeof value === 'string') {
        for (const item of value.split(/\s+/)) {
          if (item.trim()) collected.add(item.trim());
        }
      }
    };

    const addArray = (value: unknown) => {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.trim()) {
            collected.add(item.trim());
          }
        }
      }
    };

    addSpaceDelimited(payload.scope);
    addArray(payload.scopes);
    addSpaceDelimited(payload.scp);
    addArray(payload.scp);

    return [...collected];
  }

  private extractTenantId(payload: JWTPayload): string | undefined {
    return this.toClaimString(payload.tenant_id ?? payload.tenantId);
  }
}
