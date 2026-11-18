import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

describe('ChatController', () => {
  let controller: ChatController;
  let service: {
    enviarMensaje: jest.Mock<any>;
  };

  beforeEach(async () => {
    service = {
      enviarMensaje: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('debe priorizar req.user.id sobre el header x-user-id y dto.userId', async () => {
    const dto = { prompt: 'Hola', userId: 'spoofed' };
    const mockRes = { respuesta: 'Hola desde Guru' };
    service.enviarMensaje.mockResolvedValue(mockRes);

    const result = await controller.enviarMensaje(dto, {
      user: { id: 'jwt-user-1' },
      headers: { 'x-user-id': 'header-spoofed' },
    });

    expect(service.enviarMensaje).toHaveBeenCalledWith(dto, 'jwt-user-1');
    expect(result).toBe(mockRes);
  });

  it('debe usar header x-user-id cuando no hay req.user', async () => {
    const dto = { prompt: 'Hola' };
    service.enviarMensaje.mockResolvedValue({ respuesta: 'OK' });

    await controller.enviarMensaje(dto, {
      headers: { 'x-user-id': 'user-123' },
    });

    expect(service.enviarMensaje).toHaveBeenCalledWith(dto, 'user-123');
  });

  it('debe usar dto.userId como último fallback o undefined si no viene ninguno', async () => {
    service.enviarMensaje.mockResolvedValue({ respuesta: 'OK' });

    await controller.enviarMensaje({ prompt: 'Hola', userId: 'dev-user' });
    expect(service.enviarMensaje).toHaveBeenCalledWith(
      { prompt: 'Hola', userId: 'dev-user' },
      'dev-user',
    );

    await controller.enviarMensaje({ prompt: 'Hola' });
    expect(service.enviarMensaje).toHaveBeenLastCalledWith(
      { prompt: 'Hola' },
      undefined,
    );
  });
});
