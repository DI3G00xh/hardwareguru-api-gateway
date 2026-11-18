import { jest } from '@jest/globals';
import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TimeoutError, of, throwError } from 'rxjs';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let mockHttpService: {
    post: jest.Mock<any>;
  };

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'MCP_SERVICE_URL') return 'http://localhost:3001/';
              if (key === 'MCP_TIMEOUT_MS') return '45000';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('debe reenviar prompt con header x-user-id y timeout de 45000ms', async () => {
    mockHttpService.post.mockReturnValue(
      of({
        data: { respuesta: 'Tu build es óptima en 1080p.' },
      }),
    );

    const result = await service.enviarMensaje(
      { prompt: 'Simula mi PC 1080p' },
      'user-123',
    );

    expect(mockHttpService.post).toHaveBeenCalledWith(
      'http://localhost:3001/chat',
      { prompt: 'Simula mi PC 1080p' },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'user-123',
        },
        timeout: 45000,
      },
    );
    expect(result).toEqual({ respuesta: 'Tu build es óptima en 1080p.' });
  });

  it('debe adaptar el formato del frontend { mensaje, historial } a prompt', async () => {
    mockHttpService.post.mockReturnValue(
      of({
        data: { respuesta: 'Recomiendo una fuente de 650W.' },
      }),
    );

    const result = await service.enviarMensaje(
      {
        mensaje: '¿Qué fuente recomiendas?',
        historial: [
          { rol: 'usuario', texto: 'Tengo un Ryzen 5 9600X y RTX 4060' },
          { rol: 'guru', texto: 'Es una buena combinación para 1080p.' },
        ],
      },
      'user-frontend',
    );

    expect(mockHttpService.post).toHaveBeenCalledWith(
      'http://localhost:3001/chat',
      {
        prompt:
          '[Historial reciente]\nusuario: Tengo un Ryzen 5 9600X y RTX 4060\nguru: Es una buena combinación para 1080p.\n\n[Consulta actual]\n¿Qué fuente recomiendas?',
      },
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-user-id': 'user-frontend' }),
      }),
    );
    expect(result).toEqual({ respuesta: 'Recomiendo una fuente de 650W.' });
  });

  it('debe lanzar UnauthorizedException (401) si falta userId sin llamar al MCP', async () => {
    await expect(
      service.enviarMensaje({ prompt: 'Hola' }, undefined),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockHttpService.post).not.toHaveBeenCalled();
  });

  it('debe lanzar BadRequestException (400) si prompt y mensaje están vacíos', async () => {
    await expect(
      service.enviarMensaje({ prompt: '   ' }, 'user-123'),
    ).rejects.toThrow(BadRequestException);

    expect(mockHttpService.post).not.toHaveBeenCalled();
  });

  it('debe mapear TimeoutError y ECONNABORTED a GatewayTimeoutException (504)', async () => {
    mockHttpService.post.mockReturnValue(throwError(() => new TimeoutError()));

    await expect(
      service.enviarMensaje({ prompt: 'Simula' }, 'user-123'),
    ).rejects.toThrow(GatewayTimeoutException);

    mockHttpService.post.mockReturnValue(
      throwError(() => ({ code: 'ECONNABORTED', message: 'timeout' })),
    );

    await expect(
      service.enviarMensaje({ prompt: 'Simula' }, 'user-123'),
    ).rejects.toThrow(GatewayTimeoutException);
  });

  it('debe mapear error de red sin respuesta a BadGatewayException (502)', async () => {
    mockHttpService.post.mockReturnValue(
      throwError(() => ({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' })),
    );

    await expect(
      service.enviarMensaje({ prompt: 'Simula' }, 'user-123'),
    ).rejects.toThrow(BadGatewayException);
  });

  it('debe mapear errores HTTP del MCP Server (400, 401, 500)', async () => {
    mockHttpService.post.mockReturnValue(
      throwError(() => ({
        response: { status: 400, data: { error: 'El prompt es requerido' } },
      })),
    );
    await expect(
      service.enviarMensaje({ prompt: 'x' }, 'user-123'),
    ).rejects.toThrow(BadRequestException);

    mockHttpService.post.mockReturnValue(
      throwError(() => ({
        response: {
          status: 401,
          data: { error: 'No autorizado. Falta el header x-user-id' },
        },
      })),
    );
    await expect(
      service.enviarMensaje({ prompt: 'x' }, 'user-123'),
    ).rejects.toThrow(UnauthorizedException);

    mockHttpService.post.mockReturnValue(
      throwError(() => ({
        response: { status: 500, data: { error: 'Error interno' } },
      })),
    );
    await expect(
      service.enviarMensaje({ prompt: 'x' }, 'user-123'),
    ).rejects.toThrow(BadGatewayException);
  });
});
