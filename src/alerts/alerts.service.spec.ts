import { jest } from '@jest/globals';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TimeoutError, of, throwError } from 'rxjs';
import { AlertsService } from './alerts.service';
import type { AlertResponse } from './interfaces/alerts.interface';

const SAMPLE_ALERT: AlertResponse = {
  id: '8f14e45f-ceea-4e8f-9d42-9c1f4b2a7c10',
  buildId: 'b2',
  buildName: 'PC Gamer 1440p',
  porcentajeUso: 101,
  mensaje:
    'Tu fuente de 500 W está al 101% de uso con la build "PC Gamer 1440p".',
  sugerencia: 'Haz undervolt o cambia a una fuente de mayor potencia.',
  leida: false,
  creadaEn: '2026-11-17T20:00:01+00:00',
};

describe('AlertsService', () => {
  let service: AlertsService;
  let mockHttpService: {
    get: jest.Mock<any>;
    patch: jest.Mock<any>;
  };

  beforeEach(async () => {
    mockHttpService = {
      get: jest.fn(),
      patch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ALERTS_SERVICE_URL') return 'http://alerts-api:8080/';
              if (key === 'ALERTS_TIMEOUT_MS') return '5000';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
  });

  describe('listAlerts', () => {
    it('debe consultar GET /alerts?userId=... con timeout configurado', async () => {
      mockHttpService.get.mockReturnValue(of({ data: [SAMPLE_ALERT] }));

      const result = await service.listAlerts('u1');

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'http://alerts-api:8080/alerts',
        {
          params: { userId: 'u1' },
          timeout: 5000,
        },
      );
      expect(result).toEqual([SAMPLE_ALERT]);
    });

    it('debe lanzar UnauthorizedException (401) si falta userId', async () => {
      await expect(service.listAlerts('   ')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('debe propagar código HTTP y payload ProblemDetails del servicio (400, 500)', async () => {
      const problem400 = {
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
        title: 'userId es requerido',
        status: 400,
        detail: 'El gateway debe enviar el userId del usuario autenticado.',
      };
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: { status: 400, data: problem400 },
        })),
      );

      await expect(service.listAlerts('u1')).rejects.toMatchObject({
        status: 400,
        response: problem400,
      });

      const problem500 = { title: 'Internal Error', status: 500 };
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: { status: 500, data: problem500 },
        })),
      );

      await expect(service.listAlerts('u1')).rejects.toBeInstanceOf(
        HttpException,
      );
      await expect(service.listAlerts('u1')).rejects.toMatchObject({
        status: 500,
        response: problem500,
      });
    });

    it('debe mapear TimeoutError y ECONNABORTED a GatewayTimeoutException (504)', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new TimeoutError()));
      await expect(service.listAlerts('u1')).rejects.toThrow(
        GatewayTimeoutException,
      );

      mockHttpService.get.mockReturnValue(
        throwError(() => ({ code: 'ECONNABORTED', message: 'timeout' })),
      );
      await expect(service.listAlerts('u1')).rejects.toThrow(
        GatewayTimeoutException,
      );
    });

    it('debe mapear error de red sin respuesta a ServiceUnavailableException (503)', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({ code: 'ECONNREFUSED', message: 'refused' })),
      );

      await expect(service.listAlerts('u1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('markAsRead', () => {
    it('debe validar pertenencia vía GET /alerts y luego llamar PATCH /alerts/{id}/read', async () => {
      const updatedAlert: AlertResponse = { ...SAMPLE_ALERT, leida: true };
      mockHttpService.get.mockReturnValue(of({ data: [SAMPLE_ALERT] }));
      mockHttpService.patch.mockReturnValue(of({ data: updatedAlert }));

      const result = await service.markAsRead(
        SAMPLE_ALERT.id.toUpperCase(),
        'u1',
      );

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'http://alerts-api:8080/alerts',
        {
          params: { userId: 'u1' },
          timeout: 5000,
        },
      );
      expect(mockHttpService.patch).toHaveBeenCalledWith(
        `http://alerts-api:8080/alerts/${SAMPLE_ALERT.id.toUpperCase()}/read`,
        undefined,
        { timeout: 5000 },
      );
      expect(result).toEqual(updatedAlert);
    });

    it('debe rechazar con 404 sin llamar PATCH si la alerta no pertenece al usuario', async () => {
      mockHttpService.get.mockReturnValue(of({ data: [SAMPLE_ALERT] }));

      await expect(
        service.markAsRead('11111111-1111-1111-1111-111111111111', 'u1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockHttpService.patch).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException (400) si el id no es un UUID válido', async () => {
      await expect(service.markAsRead('no-es-uuid', 'u1')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockHttpService.get).not.toHaveBeenCalled();
      expect(mockHttpService.patch).not.toHaveBeenCalled();
    });

    it('debe propagar 404 del servicio upstream en PATCH', async () => {
      const problem404 = {
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.5',
        title: 'Alerta no encontrada',
        status: 404,
        detail: `No existe una alerta con id ${SAMPLE_ALERT.id}.`,
      };
      mockHttpService.get.mockReturnValue(of({ data: [SAMPLE_ALERT] }));
      mockHttpService.patch.mockReturnValue(
        throwError(() => ({
          response: { status: 404, data: problem404 },
        })),
      );

      await expect(
        service.markAsRead(SAMPLE_ALERT.id, 'u1'),
      ).rejects.toMatchObject({
        status: 404,
        response: problem404,
      });
    });

    it('debe mapear timeout y fallo de red en PATCH a 504 y 503', async () => {
      mockHttpService.get.mockReturnValue(of({ data: [SAMPLE_ALERT] }));
      mockHttpService.patch.mockReturnValue(
        throwError(() => new TimeoutError()),
      );

      await expect(service.markAsRead(SAMPLE_ALERT.id, 'u1')).rejects.toThrow(
        GatewayTimeoutException,
      );

      mockHttpService.patch.mockReturnValue(
        throwError(() => ({ code: 'ECONNREFUSED' })),
      );

      await expect(service.markAsRead(SAMPLE_ALERT.id, 'u1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
