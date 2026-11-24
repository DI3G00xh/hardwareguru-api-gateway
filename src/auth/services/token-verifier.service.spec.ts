import { jest } from '@jest/globals';
import { HttpService } from '@nestjs/axios';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { of, throwError } from 'rxjs';
import { TokenVerifierService } from './token-verifier.service';

describe('TokenVerifierService', () => {
  const jwtSecret = 'super_secreto_hardwareguru_2026';
  const jwksUrl = 'http://localhost:4000/.well-known/jwks.json';

  let service: TokenVerifierService;
  let mockHttpService: { get: jest.Mock<any> };
  let envValues: Record<string, string | undefined>;

  beforeEach(async () => {
    envValues = {
      JWT_SECRET: jwtSecret,
      AUTH_JWKS_URL: jwksUrl,
    };

    mockHttpService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenVerifierService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => envValues[key]),
          },
        },
      ],
    }).compile();

    service = module.get<TokenVerifierService>(TokenVerifierService);
  });

  it('debe verificar token HS256 de auth-service y convertir user_id numérico a string', async () => {
    const token = await new SignJWT({
      user_id: 2,
      email: 'maxi@hardwareguru.cl',
      tenant_id: 'hg-cl',
      role: 'admin',
      scope: 'builds:read builds:write',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('4h')
      .sign(new TextEncoder().encode(jwtSecret));

    const user = await service.verify(token);

    expect(user).toEqual({
      id: '2',
      sub: '2',
      email: 'maxi@hardwareguru.cl',
      role: 'admin',
      roles: ['admin'],
      scopes: ['builds:read', 'builds:write'],
      tenantId: 'hg-cl',
      authType: 'jwt',
    });
  });

  it('debe rechazar token HS256 expirado con UnauthorizedException', async () => {
    const expiredToken = await new SignJWT({ user_id: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(jwtSecret));

    await expect(service.verify(expiredToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('debe rechazar token sin claim exp con UnauthorizedException', async () => {
    const tokenWithoutExp = await new SignJWT({ user_id: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(new TextEncoder().encode(jwtSecret));

    await expect(service.verify(tokenWithoutExp)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('debe rechazar token con firma inválida o algoritmo none', async () => {
    const badSignatureToken = await new SignJWT({ user_id: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('otro_secreto_incorrecto'));

    await expect(service.verify(badSignatureToken)).rejects.toThrow(
      UnauthorizedException,
    );

    const unsignedHeader = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url');
    const unsignedPayload = Buffer.from(
      JSON.stringify({ user_id: 1, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url');
    await expect(
      service.verify(`${unsignedHeader}.${unsignedPayload}.`),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe descargar las claves públicas JWKS una sola vez y verificar múltiples tokens RS256 localmente', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);

    mockHttpService.get.mockReturnValue(
      of({
        data: {
          keys: [{ ...publicJwk, kid: 'hg-key-1', alg: 'RS256', use: 'sig' }],
        },
      }),
    );

    const token1 = await new SignJWT({
      user_id: 10,
      roles: ['editor'],
      scopes: ['chat:use'],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'hg-key-1' })
      .setExpirationTime('1h')
      .sign(privateKey);

    const token2 = await new SignJWT({
      user_id: 20,
      role: 'viewer',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'hg-key-1' })
      .setExpirationTime('1h')
      .sign(privateKey);

    const [user1, user2] = await Promise.all([
      service.verify(token1),
      service.verify(token2),
    ]);
    const user1Again = await service.verify(token1);

    expect(mockHttpService.get).toHaveBeenCalledTimes(1);
    expect(mockHttpService.get).toHaveBeenCalledWith(jwksUrl, {
      timeout: 5000,
    });
    expect(user1.id).toBe('10');
    expect(user1.roles).toEqual(['editor']);
    expect(user1.scopes).toEqual(['chat:use']);
    expect(user2.id).toBe('20');
    expect(user1Again.id).toBe('10');
  });

  it('debe rechazar si JWKS no contiene el kid solicitado o falla la descarga', async () => {
    mockHttpService.get.mockReturnValue(
      throwError(() => new Error('ECONNREFUSED')),
    );

    const { privateKey } = await generateKeyPair('RS256');
    const token = await new SignJWT({ user_id: 5 })
      .setProtectedHeader({ alg: 'RS256', kid: 'unknown-kid' })
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
  });
});
