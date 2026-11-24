import { jest } from '@jest/globals';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
  REQUIRE_API_KEY,
  ROLES_KEY,
  SCOPES_KEY,
} from '../auth.constants';
import type {
  ApiKeyRecord,
  AuthenticatedUser,
  RequestWithAuth,
} from '../interfaces/auth.interface';
import { ApiKeyService } from '../services/api-key.service';
import { TokenVerifierService } from '../services/token-verifier.service';
import { GatewayAuthGuard } from './gateway-auth.guard';

describe('GatewayAuthGuard', () => {
  let guard: GatewayAuthGuard;
  let mockReflector: { getAllAndOverride: jest.Mock<any> };
  let mockTokenVerifier: { verify: jest.Mock<any> };
  let mockApiKeyService: {
    isRequiredByDefault: jest.Mock<any>;
    validateApiKey: jest.Mock<any>;
  };
  let metadata: Record<string, unknown>;

  const createHttpContext = (request: RequestWithAuth): ExecutionContext =>
    ({
      getType: () => 'http',
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    metadata = {};
    mockReflector = {
      getAllAndOverride: jest.fn((key: string) => metadata[key]),
    };
    mockTokenVerifier = {
      verify: jest.fn(),
    };
    mockApiKeyService = {
      isRequiredByDefault: jest.fn().mockReturnValue(false),
      validateApiKey: jest.fn(),
    };

    guard = new GatewayAuthGuard(
      mockReflector as unknown as Reflector,
      mockTokenVerifier as unknown as TokenVerifierService,
      mockApiKeyService as unknown as ApiKeyService,
    );
  });

  it('debe sanitizar headers de identidad falsificados incluso en rutas públicas', async () => {
    metadata[IS_PUBLIC_KEY] = true;
    const req: RequestWithAuth = {
      headers: {
        'x-user-id': 'spoofed-1',
        'x-user-role': 'admin',
        'x-tenant-id': 'evil',
      },
    };

    await expect(guard.canActivate(createHttpContext(req))).resolves.toBe(true);
    expect(req.headers['x-user-id']).toBeUndefined();
    expect(req.headers['x-user-role']).toBeUndefined();
    expect(req.headers['x-tenant-id']).toBeUndefined();
    expect(req.user).toBeUndefined();
  });

  it('debe cortar tráfico sin token en rutas protegidas con 401 Unauthorized', async () => {
    const req: RequestWithAuth = {
      headers: { 'x-user-id': 'spoofed-99' },
    };

    await expect(guard.canActivate(createHttpContext(req))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(req.headers['x-user-id']).toBeUndefined();
  });

  it('debe propagar x-user-id, x-user-role y x-tenant-id desde JWT válido', async () => {
    const verifiedUser: AuthenticatedUser = {
      id: '42',
      sub: '42',
      email: 'user@hardwareguru.cl',
      role: 'moderator',
      roles: ['moderator'],
      scopes: ['builds:write'],
      tenantId: 'tenant-1',
      authType: 'jwt',
    };
    mockTokenVerifier.verify.mockResolvedValue(verifiedUser);

    const req: RequestWithAuth = {
      headers: {
        authorization: 'Bearer valid.jwt.token',
        'x-user-id': 'attacker',
      },
    };

    await expect(guard.canActivate(createHttpContext(req))).resolves.toBe(true);
    expect(mockTokenVerifier.verify).toHaveBeenCalledWith('valid.jwt.token');
    expect(req.user).toEqual(verifiedUser);
    expect(req.headers['x-user-id']).toBe('42');
    expect(req.headers['x-user-role']).toBe('moderator');
    expect(req.headers['x-tenant-id']).toBe('tenant-1');
  });

  it('debe validar roles y scopes requeridos y rechazar con 403 si faltan', async () => {
    metadata[ROLES_KEY] = ['admin'];
    metadata[SCOPES_KEY] = ['users:write'];
    mockTokenVerifier.verify.mockResolvedValue({
      id: '7',
      role: 'user',
      roles: ['user'],
      scopes: ['users:read'],
      authType: 'jwt',
    });

    const req: RequestWithAuth = {
      headers: { authorization: 'Bearer valid.token' },
    };

    await expect(guard.canActivate(createHttpContext(req))).rejects.toThrow(
      ForbiddenException,
    );

    mockTokenVerifier.verify.mockResolvedValue({
      id: '7',
      role: 'admin',
      roles: ['admin'],
      scopes: ['users:read', 'users:write'],
      authType: 'jwt',
    });

    await expect(guard.canActivate(createHttpContext(req))).resolves.toBe(true);
  });

  it('debe inspeccionar x-api-key, rechazar inactivas/inválidas y exigirla si es obligatoria', async () => {
    const reqBadKey: RequestWithAuth = {
      headers: { 'x-api-key': 'bad-key' },
    };
    mockApiKeyService.validateApiKey.mockImplementation(() => {
      throw new UnauthorizedException('API Key inválida');
    });

    await expect(
      guard.canActivate(createHttpContext(reqBadKey)),
    ).rejects.toThrow(UnauthorizedException);

    metadata[REQUIRE_API_KEY] = true;
    const reqMissingKey: RequestWithAuth = {
      headers: { authorization: 'Bearer valid.token' },
    };
    await expect(
      guard.canActivate(createHttpContext(reqMissingKey)),
    ).rejects.toThrow(UnauthorizedException);

    const activeRecord: ApiKeyRecord = {
      key: 'good-key',
      name: 'partner',
      active: true,
      role: 'service',
      roles: ['service'],
      tenantId: 'hg-partner',
      userId: 'svc-1',
    };
    mockApiKeyService.validateApiKey.mockReturnValue(activeRecord);
    const reqGoodKey: RequestWithAuth = {
      headers: { 'x-api-key': 'good-key' },
    };
    await expect(
      guard.canActivate(createHttpContext(reqGoodKey)),
    ).resolves.toBe(true);
    expect(reqGoodKey.headers['x-user-id']).toBe('svc-1');
    expect(reqGoodKey.headers['x-user-role']).toBe('service');
    expect(reqGoodKey.headers['x-tenant-id']).toBe('hg-partner');
  });

  it('en rutas OptionalAuth permite invitado sin token pero rechaza token inválido', async () => {
    metadata[IS_OPTIONAL_AUTH_KEY] = true;

    const guestReq: RequestWithAuth = {
      headers: { 'x-user-id': 'spoofed' },
    };
    await expect(guard.canActivate(createHttpContext(guestReq))).resolves.toBe(
      true,
    );
    expect(guestReq.headers['x-user-id']).toBeUndefined();

    mockTokenVerifier.verify.mockRejectedValue(
      new UnauthorizedException('Token inválido'),
    );
    const badTokenReq: RequestWithAuth = {
      headers: { authorization: 'Bearer invalid' },
    };
    await expect(
      guard.canActivate(createHttpContext(badTokenReq)),
    ).rejects.toThrow(UnauthorizedException);
  });
});
