import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyService } from './api-key.service';

describe('ApiKeyService', () => {
  const createService = (env: Record<string, string | undefined>) =>
    new ApiKeyService({
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService);

  it('debe validar una API Key activa configurada en JSON', () => {
    const service = createService({
      API_KEYS: JSON.stringify([
        {
          key: 'hg_live_abc',
          name: 'frontend-app',
          active: true,
          role: 'service',
          scopes: ['catalog:read'],
          tenantId: 'hg-cl',
        },
        {
          key: 'hg_revoked_xyz',
          name: 'old-client',
          active: false,
        },
      ]),
      REQUIRE_API_KEY: 'true',
    });

    expect(service.isRequiredByDefault()).toBe(true);
    expect(service.hasConfiguredKeys()).toBe(true);

    const valid = service.validateApiKey('hg_live_abc');
    expect(valid.name).toBe('frontend-app');
    expect(valid.active).toBe(true);
    expect(valid.tenantId).toBe('hg-cl');
    expect(valid.scopes).toEqual(['catalog:read']);
  });

  it('debe rechazar API Keys inactivas o inexistentes con UnauthorizedException', () => {
    const service = createService({
      API_KEYS: 'hg_active:web:true,hg_disabled:mobile:false',
    });

    expect(service.validateApiKey('hg_active').name).toBe('web');
    expect(() => service.validateApiKey('hg_disabled')).toThrow(
      UnauthorizedException,
    );
    expect(() => service.validateApiKey('hg_unknown')).toThrow(
      UnauthorizedException,
    );
    expect(() => service.validateApiKey('')).toThrow(UnauthorizedException);
  });
});
