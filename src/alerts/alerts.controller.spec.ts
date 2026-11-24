import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

describe('AlertsController', () => {
  let controller: AlertsController;
  let service: {
    listAlerts: jest.Mock<any>;
    markAsRead: jest.Mock<any>;
  };

  beforeEach(async () => {
    service = {
      listAlerts: jest.fn(),
      markAsRead: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        {
          provide: AlertsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<AlertsController>(AlertsController);
  });

  it('debe listar alertas usando req.user.id sin aceptar userId del cliente', async () => {
    const alerts = [{ id: '8f14e45f-ceea-4e8f-9d42-9c1f4b2a7c10', leida: false }];
    service.listAlerts.mockResolvedValue(alerts);

    const result = await controller.listAlerts({
      user: {
        id: 'u1',
        role: 'user',
        roles: ['user'],
        scopes: [],
        authType: 'jwt',
      },
      headers: { 'x-user-id': 'header-spoofed' },
    });

    expect(service.listAlerts).toHaveBeenCalledWith('u1');
    expect(result).toBe(alerts);
  });

  it('debe usar header x-user-id si no viene req.user', async () => {
    service.listAlerts.mockResolvedValue([]);

    await controller.listAlerts({
      headers: { 'x-user-id': 'u2' },
    });

    expect(service.listAlerts).toHaveBeenCalledWith('u2');
  });

  it('debe lanzar UnauthorizedException si no hay identidad de usuario', async () => {
    await expect(controller.listAlerts(undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      controller.markAsRead('8f14e45f-ceea-4e8f-9d42-9c1f4b2a7c10', {
        headers: {},
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe delegar markAsRead con id y userId autenticado', async () => {
    const alertId = '8f14e45f-ceea-4e8f-9d42-9c1f4b2a7c10';
    const updated = { id: alertId, leida: true };
    service.markAsRead.mockResolvedValue(updated);

    const result = await controller.markAsRead(alertId, {
      user: {
        id: '',
        sub: 'u1',
        role: 'user',
        roles: ['user'],
        scopes: [],
        authType: 'jwt',
      },
      headers: {},
    });

    expect(service.markAsRead).toHaveBeenCalledWith(alertId, 'u1');
    expect(result).toBe(updated);
  });
});
