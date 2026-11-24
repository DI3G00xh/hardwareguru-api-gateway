import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: {
    register: jest.Mock<any>;
    login: jest.Mock<any>;
    getMe: jest.Mock<any>;
    updateProfile: jest.Mock<any>;
  };

  beforeEach(async () => {
    service = {
      register: jest.fn(),
      login: jest.fn(),
      getMe: jest.fn(),
      updateProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('debe delegar register y login a AuthService', async () => {
    const regDto = {
      nombre: 'Maxi',
      email: 'maxi@hardwareguru.cl',
      password: 'password123',
    };
    service.register.mockResolvedValue({ mensaje: 'ok' });
    await controller.register(regDto);
    expect(service.register).toHaveBeenCalledWith(regDto);

    const loginDto = { email: 'maxi@hardwareguru.cl', password: 'password123' };
    service.login.mockResolvedValue({ token: 'abc' });
    await controller.login(loginDto);
    expect(service.login).toHaveBeenCalledWith(loginDto);
  });

  it('debe extraer identidad en getMe y updateProfile o lanzar 401 si falta userId', async () => {
    service.getMe.mockResolvedValue({ id: 2, email: 'maxi@hardwareguru.cl' });
    await controller.getMe({
      user: {
        id: '2',
        role: 'user',
        roles: ['user'],
        scopes: [],
        tenantId: 'hg',
        authType: 'jwt',
      },
      headers: {},
    });
    expect(service.getMe).toHaveBeenCalledWith({
      userId: '2',
      role: 'user',
      tenantId: 'hg',
    });

    await expect(controller.getMe({ headers: {} })).rejects.toThrow(
      UnauthorizedException,
    );

    service.updateProfile.mockResolvedValue({ mensaje: 'actualizado' });
    await controller.updateProfile(
      { nombre: 'Nuevo' },
      { headers: { 'x-user-id': '2', 'x-user-role': 'user' } },
    );
    expect(service.updateProfile).toHaveBeenCalledWith(
      { nombre: 'Nuevo' },
      { userId: '2', role: 'user' },
    );
  });
});
