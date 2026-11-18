import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SimulacionesController,
  SimuladorController,
  SimularController,
} from './simulador.controller';
import { SimuladorService } from './simulador.service';

describe('SimuladorController', () => {
  let simuladorController: SimuladorController;
  let simulacionesController: SimulacionesController;
  let simularController: SimularController;
  let service: {
    simular: jest.Mock<any>;
    simularParaFrontend: jest.Mock<any>;
    guardarBuild: jest.Mock<any>;
  };

  beforeEach(async () => {
    service = {
      simular: jest.fn(),
      simularParaFrontend: jest.fn(),
      guardarBuild: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        SimuladorController,
        SimulacionesController,
        SimularController,
      ],
      providers: [
        {
          provide: SimuladorService,
          useValue: service,
        },
      ],
    }).compile();

    simuladorController = module.get<SimuladorController>(SimuladorController);
    simulacionesController = module.get<SimulacionesController>(
      SimulacionesController,
    );
    simularController = module.get<SimularController>(SimularController);
  });

  it('debe delegar POST /simulador/calcular a SimuladorService.simular', async () => {
    const dto = {
      cpuTdpWatts: 125,
      cpuBenchmarkScore: 28000,
      gpuTdpWatts: 220,
      gpuBenchmarkScore: 25000,
      psuWatts: 750,
      resolucion: '1440p',
    };
    const mockRes = {
      consumoTotalWatts: 395,
      cuelloBotellaPorcentaje: 0,
      estado: 'Óptimo',
      motivo: 'Tu sistema está perfectamente balanceado.',
    };
    service.simular.mockResolvedValue(mockRes);

    const result = await simuladorController.calcular(dto, {
      user: { id: 'user-99' },
    });

    expect(service.simular).toHaveBeenCalledWith(dto, 'user-99');
    expect(result).toBe(mockRes);
  });

  it('debe delegar POST /simulaciones a SimuladorService.simular', async () => {
    const dto = {
      cpuId: 'cpu-9600x',
      gpuId: 'gpu-4060',
      psuId: 'psu-650',
      resolucion: '1080p',
    };
    const mockRes = {
      consumoTotalWatts: 230,
      cuelloBotellaPorcentaje: 0,
      estado: 'Óptimo',
      motivo: 'Tu sistema está perfectamente balanceado.',
    };
    service.simular.mockResolvedValue(mockRes);

    const result = await simulacionesController.crearSimulacion(dto);

    expect(service.simular).toHaveBeenCalledWith(dto, undefined);
    expect(result).toBe(mockRes);
  });

  it('debe delegar POST /simular a SimuladorService.simularParaFrontend', async () => {
    const dto = {
      cpuId: 'cpu-9600x',
      placaId: 'mb-b650',
      ramId: 'ram-ddr5-16',
      gpuId: 'gpu-4060',
      fuenteId: 'psu-650',
      resolucion: '1080p',
    };
    const mockFrontendRes = {
      consumoEstimadoW: 230,
      cuelloBotellaPct: 0,
      resolucion: '1080p',
      estado: 'BALANCEADO',
      motivo: null,
    };
    service.simularParaFrontend.mockResolvedValue(mockFrontendRes);

    const result = await simularController.simularFrontend(dto, {
      headers: { 'x-user-id': 'user-header-1' },
    });

    expect(service.simularParaFrontend).toHaveBeenCalledWith(
      dto,
      'user-header-1',
    );
    expect(result).toBe(mockFrontendRes);
  });

  it('debe delegar POST /simulador/builds a SimuladorService.guardarBuild', async () => {
    const dto = {
      nombreBuild: 'PC Gamer',
      cpuId: 'cpu-1',
      resolucion: '1080p',
    };
    const mockRes = { buildId: 'b-1', success: true };
    service.guardarBuild.mockResolvedValue(mockRes);

    const result = await simuladorController.guardarBuild(dto);

    expect(service.guardarBuild).toHaveBeenCalledWith(dto, undefined);
    expect(result).toBe(mockRes);
  });
});
