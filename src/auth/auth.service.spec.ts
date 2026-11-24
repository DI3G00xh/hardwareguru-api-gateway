import { jest } from '@jest/globals';
import { HttpService } from '@nestjs/axios';
import {
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TimeoutError, of, throwError } from 'rxjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockHttpService: { request: jest.Mock<any> };

  beforeEach(async () => {
    mockHttpService = {
      request: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'AUTH_SERVICE_URL') return 'http://localhost:4000/';
              if (key === 'AUTH_TIMEOUT_MS') return '5000';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('debe reenviar register y login al auth-service', async () => {
    const regPayload = {
      nombre: 'Maxi',
      email: 'maxi@hardwareguru.cl',
      password: 'password123',
    };
    const regResponse = {
      mensaje: 'Usuario registrado',
      user: { id: 2, nombre: 'Maxi', email: 'maxi@hardwareguru.cl' },
    };
    mockHttpService.request.mockReturnValue(of({ data: regResponse }));

    const regResult = await service.register(regPayload);
    expect(mockHttpService.request).toHaveBeenCalledWith({
      method: 'POST',
      url: 'http://localhost:4000/api/auth/register',
      data: regPayload,
      headers: undefined,
      timeout: 5000,
    });
    expect(regResult).toEqual(regResponse);

    const loginPayload = {
      email: 'maxi@hardwareguru.cl',
      password: 'password123',
    };
    const loginResponse = {
      mensaje: 'Login exitoso',
      token: 'jwt-token',
      user: { id: 2, nombre: 'Maxi', email: 'maxi@hardwareguru.cl' },
    };
    mockHttpService.request.mockReturnValue(of({ data: loginResponse }));

    const loginResult = await service.login(loginPayload);
    expect(mockHttpService.request).toHaveBeenCalledWith({
      method: 'POST',
      url: 'http://localhost:4000/api/auth/login',
      data: loginPayload,
      headers: undefined,
      timeout: 5000,
    });
    expect(loginResult).toEqual(loginResponse);
  });

  it('debe propagar cabeceras limpias en getMe y updateProfile', async () => {
    mockHttpService.request.mockReturnValue(
      of({ data: { id: 2, nombre: 'Maxi', email: 'maxi@hardwareguru.cl' } }),
    );

    await service.getMe({ userId: '2', role: 'user', tenantId: 'hg' });
    expect(mockHttpService.request).toHaveBeenCalledWith({
      method: 'GET',
      url: 'http://localhost:4000/api/auth/me',
      data: undefined,
      headers: {
        'x-user-id': '2',
        'x-user-role': 'user',
        'x-tenant-id': 'hg',
      },
      timeout: 5000,
    });

    await service.updateProfile(
      { nombre: 'Maxi Pro' },
      { userId: '2', role: 'user' },
    );
    expect(mockHttpService.request).toHaveBeenCalledWith({
      method: 'PUT',
      url: 'http://localhost:4000/api/auth/profile',
      data: { nombre: 'Maxi Pro' },
      headers: {
        'x-user-id': '2',
        'x-user-role': 'user',
      },
      timeout: 5000,
    });
  });

  it('debe propagar status y body de error de auth-service y mapear timeout/indisponibilidad', async () => {
    mockHttpService.request.mockReturnValue(
      throwError(() => ({
        response: { status: 401, data: { error: 'Credenciales inválidas' } },
      })),
    );
    await expect(
      service.login({ email: 'a@b.cl', password: 'bad' }),
    ).rejects.toThrow(HttpException);

    mockHttpService.request.mockReturnValue(
      throwError(() => new TimeoutError()),
    );
    await expect(service.getMe({ userId: '2' })).rejects.toThrow(
      GatewayTimeoutException,
    );

    mockHttpService.request.mockReturnValue(
      throwError(() => ({ code: 'ECONNREFUSED' })),
    );
    await expect(service.getMe({ userId: '2' })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
