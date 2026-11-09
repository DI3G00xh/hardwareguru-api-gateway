import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogoController, CompatibilidadController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';

describe('CatalogoController', () => {
  let controller: CatalogoController;
  let compatibilidadController: CompatibilidadController;
  let service: {
    listarComponentes: jest.Mock<any>;
    obtenerSpecs: jest.Mock<any>;
    verificarCompatibilidad: jest.Mock<any>;
  };

  beforeEach(async () => {
    service = {
      listarComponentes: jest.fn(),
      obtenerSpecs: jest.fn(),
      verificarCompatibilidad: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogoController, CompatibilidadController],
      providers: [
        {
          provide: CatalogoService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<CatalogoController>(CatalogoController);
    compatibilidadController = module.get<CompatibilidadController>(
      CompatibilidadController,
    );
  });

  it('debe listar componentes', async () => {
    const mockComponentes = [{ id: '1', nombre: 'CPU 1' }];
    service.listarComponentes.mockResolvedValue(mockComponentes);

    const result = await controller.listar('cpu');
    expect(service.listarComponentes).toHaveBeenCalledWith('cpu');
    expect(result).toBe(mockComponentes);
  });

  it('debe obtener detalle de especificaciones', async () => {
    const mockDetalle = { id: '1', nombre: 'CPU 1', especificaciones: {} };
    service.obtenerSpecs.mockResolvedValue(mockDetalle);

    const result = await controller.obtenerDetalle('1');
    expect(service.obtenerSpecs).toHaveBeenCalledWith('1');
    expect(result).toBe(mockDetalle);
  });

  it('debe verificar compatibilidad desde CatalogoController', async () => {
    const mockBuild = { cpu_id: '1' };
    const mockCompat = { compatible: true, errores: [], consumoEstimadoW: 300 };
    service.verificarCompatibilidad.mockResolvedValue(mockCompat);

    const result = await controller.verificarCompatibilidad(mockBuild);
    expect(service.verificarCompatibilidad).toHaveBeenCalledWith(mockBuild);
    expect(result).toBe(mockCompat);
  });

  it('debe verificar compatibilidad desde CompatibilidadController', async () => {
    const mockBuild = { cpu_id: '1' };
    const mockCompat = { compatible: true, errores: [], consumoEstimadoW: 300 };
    service.verificarCompatibilidad.mockResolvedValue(mockCompat);

    const result = await compatibilidadController.verificarCompatibilidad(mockBuild);
    expect(service.verificarCompatibilidad).toHaveBeenCalledWith(mockBuild);
    expect(result).toBe(mockCompat);
  });
});
