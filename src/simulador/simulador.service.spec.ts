import { jest } from '@jest/globals';
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { TimeoutError, of, throwError } from 'rxjs';
import { CatalogoService } from '../catalogo/catalogo.service';
import { SimuladorService } from './simulador.service';

describe('SimuladorService', () => {
  let service: SimuladorService;
  let mockGrpcClient: {
    simularRendimiento: jest.Mock<any>;
    guardarBuild: jest.Mock<any>;
  };
  let mockCatalogoService: {
    obtenerSpecs: jest.Mock<any>;
    verificarCompatibilidad: jest.Mock<any>;
  };

  beforeEach(async () => {
    mockGrpcClient = {
      simularRendimiento: jest.fn(),
      guardarBuild: jest.fn(),
    };

    mockCatalogoService = {
      obtenerSpecs: jest.fn(),
      verificarCompatibilidad: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimuladorService,
        {
          provide: 'SIMULATOR_PACKAGE',
          useValue: {
            getService: jest.fn().mockReturnValue(mockGrpcClient),
          },
        },
        {
          provide: CatalogoService,
          useValue: mockCatalogoService,
        },
      ],
    }).compile();

    service = module.get<SimuladorService>(SimuladorService);
    service.onModuleInit();
  });

  describe('simular (métricas directas)', () => {
    it('debe simular con métricas en snake_case y mapear la respuesta a camelCase', async () => {
      mockGrpcClient.simularRendimiento.mockReturnValue(
        of({
          consumo_total_watts: 395,
          cuello_botella_porcentaje: 0,
          estado: 'Óptimo',
          motivo: 'Tu sistema está perfectamente balanceado.',
        }),
      );

      const result = await service.simular({
        cpu_tdp_watts: 125,
        cpu_benchmark_score: 28000,
        gpu_tdp_watts: 220,
        gpu_benchmark_score: 25000,
        psu_watts: 750,
        resolucion: '1440p',
        user_id: 'user-123',
      });

      expect(mockGrpcClient.simularRendimiento).toHaveBeenCalledWith(
        {
          cpu_tdp_watts: 125,
          cpu_benchmark_score: 28000,
          gpu_tdp_watts: 220,
          gpu_benchmark_score: 25000,
          resolucion: '1440p',
          psu_watts: 750,
          user_id: 'user-123',
        },
        expect.anything(),
        expect.objectContaining({ deadline: expect.any(Date) }),
      );
      expect(result).toEqual({
        consumoTotalWatts: 395,
        cuelloBotellaPorcentaje: 0,
        estado: 'Óptimo',
        motivo: 'Tu sistema está perfectamente balanceado.',
      });
    });

    it('debe priorizar authenticatedUserId sobre userId del body y usar "0" si es invitado', async () => {
      mockGrpcClient.simularRendimiento.mockReturnValue(
        of({
          consumo_total_watts: 355,
          cuello_botella_porcentaje: 0,
          estado: 'Óptimo',
          motivo: 'OK',
        }),
      );

      await service.simular(
        {
          cpuTdpWatts: 105,
          cpuBenchmarkScore: 32000,
          gpuTdpWatts: 200,
          gpuBenchmarkScore: 29000,
          psuWatts: 650,
          resolucion: '1080p',
          userId: 'spoofed-id',
        },
        'jwt-user-42',
      );

      expect(mockGrpcClient.simularRendimiento).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'jwt-user-42' }),
        expect.anything(),
        expect.anything(),
      );

      await service.simular({
        cpuTdpWatts: 105,
        cpuBenchmarkScore: 32000,
        gpuTdpWatts: 200,
        gpuBenchmarkScore: 29000,
        psuWatts: 650,
        resolucion: '1080p',
      });

      expect(mockGrpcClient.simularRendimiento).toHaveBeenLastCalledWith(
        expect.objectContaining({ user_id: '0' }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('simular (orquestación con Catálogo)', () => {
    it('debe enriquecer IDs desde CatalogoService usando PassMark o Cinebench/TimeSpy', async () => {
      mockCatalogoService.obtenerSpecs.mockImplementation((id: string) => {
        if (id === 'cpu-9600x') {
          return Promise.resolve({
            id: 'cpu-9600x',
            tipo: 'cpu',
            tdp: 65,
            especificaciones: {},
            benchmarks: { cinebenchR24: 1200, geekbenchSingle: 2900 },
          });
        }
        if (id === 'gpu-4060') {
          return Promise.resolve({
            id: 'gpu-4060',
            tipo: 'gpu',
            tdp: 115,
            especificaciones: {},
            benchmarks: { timespy: 10500 },
          });
        }
        if (id === 'psu-650') {
          return Promise.resolve({
            id: 'psu-650',
            tipo: 'fuente',
            potenciaW: 650,
            especificaciones: {},
            benchmarks: {},
          });
        }
        return Promise.resolve(null);
      });

      mockGrpcClient.simularRendimiento.mockReturnValue(
        of({
          consumo_total_watts: 230,
          cuello_botella_porcentaje: 0,
          estado: 'Óptimo',
          motivo: 'Tu sistema está perfectamente balanceado.',
        }),
      );

      const result = await service.simular({
        cpuId: 'cpu-9600x',
        gpuId: 'gpu-4060',
        fuenteId: 'psu-650',
        resolucion: '1080p',
      });

      expect(mockCatalogoService.obtenerSpecs).toHaveBeenCalledTimes(3);
      expect(mockGrpcClient.simularRendimiento).toHaveBeenCalledWith(
        {
          cpu_tdp_watts: 65,
          cpu_benchmark_score: 12000,
          gpu_tdp_watts: 115,
          gpu_benchmark_score: 10500,
          resolucion: '1080p',
          psu_watts: 650,
          user_id: '0',
        },
        expect.anything(),
        expect.anything(),
      );
      expect(result.consumoTotalWatts).toBe(230);
    });
  });

  describe('simularParaFrontend', () => {
    it('debe retornar INCOMPATIBLE si verificarCompatibilidad falla', async () => {
      mockCatalogoService.verificarCompatibilidad.mockResolvedValue({
        compatible: false,
        errores: ['Socket incompatible'],
        consumoEstimadoW: 400,
      });

      const result = await service.simularParaFrontend({
        cpuId: 'cpu-1',
        placaId: 'mb-1',
        ramId: 'ram-1',
        gpuId: 'gpu-1',
        fuenteId: 'psu-1',
        resolucion: '1080p',
      });

      expect(mockGrpcClient.simularRendimiento).not.toHaveBeenCalled();
      expect(result).toEqual({
        consumoEstimadoW: 400,
        cuelloBotellaPct: 0,
        resolucion: '1080p',
        estado: 'INCOMPATIBLE',
        motivo: 'Socket incompatible',
      });
    });

    it('debe mapear estado "Óptimo" a "BALANCEADO" con motivo null', async () => {
      mockCatalogoService.verificarCompatibilidad.mockResolvedValue({
        compatible: true,
        errores: [],
        consumoEstimadoW: 300,
      });
      mockCatalogoService.obtenerSpecs.mockImplementation((id: string) => {
        if (id === 'cpu-1') {
          return Promise.resolve({
            tdp: 65,
            benchmarks: { passmark_cpu: 25000 },
          });
        }
        if (id === 'gpu-1') {
          return Promise.resolve({
            tdp: 200,
            benchmarks: { passmark_gpu: 24000 },
          });
        }
        return Promise.resolve({ potenciaW: 650 });
      });
      mockGrpcClient.simularRendimiento.mockReturnValue(
        of({
          consumo_total_watts: 315,
          cuello_botella_porcentaje: 4,
          estado: 'Óptimo',
          motivo: 'Tu sistema está perfectamente balanceado.',
        }),
      );

      const result = await service.simularParaFrontend({
        cpuId: 'cpu-1',
        placaId: 'mb-1',
        ramId: 'ram-1',
        gpuId: 'gpu-1',
        fuenteId: 'psu-1',
        resolucion: '1440p',
      });

      expect(result).toEqual({
        consumoEstimadoW: 315,
        cuelloBotellaPct: 4,
        resolucion: '1440p',
        estado: 'BALANCEADO',
        motivo: null,
      });
    });

    it('debe mapear estado "Riesgo Crítico" a "RIESGO" preservando motivo', async () => {
      mockGrpcClient.simularRendimiento.mockReturnValue(
        of({
          consumo_total_watts: 420,
          cuello_botella_porcentaje: 0,
          estado: 'Riesgo Crítico',
          motivo: 'Excede el 85% de la fuente.',
        }),
      );

      const result = await service.simularParaFrontend({
        cpuTdpWatts: 170,
        cpuBenchmarkScore: 30000,
        gpuTdpWatts: 200,
        gpuBenchmarkScore: 28000,
        psuWatts: 450,
        resolucion: '1080p',
      });

      expect(result).toEqual({
        consumoEstimadoW: 420,
        cuelloBotellaPct: 0,
        resolucion: '1080p',
        estado: 'RIESGO',
        motivo: 'Excede el 85% de la fuente.',
      });
    });
  });

  describe('Validaciones defensivas', () => {
    it('debe rechazar cpu_benchmark_score <= 0 sin llamar a gRPC', async () => {
      await expect(
        service.simular({
          cpu_tdp_watts: 65,
          cpu_benchmark_score: 0,
          gpu_tdp_watts: 200,
          gpu_benchmark_score: 25000,
          psu_watts: 650,
          resolucion: '1080p',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockGrpcClient.simularRendimiento).not.toHaveBeenCalled();
    });

    it('debe rechazar resolución vacía sin llamar a gRPC', async () => {
      await expect(
        service.simular({
          cpu_tdp_watts: 65,
          cpu_benchmark_score: 25000,
          gpu_tdp_watts: 200,
          gpu_benchmark_score: 25000,
          psu_watts: 650,
          resolucion: '   ',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockGrpcClient.simularRendimiento).not.toHaveBeenCalled();
    });
  });

  describe('guardarBuild y mapeo de errores gRPC', () => {
    it('debe mapear UNIMPLEMENTED (12) de GuardarBuild a NotImplementedException (501)', async () => {
      mockGrpcClient.guardarBuild.mockReturnValue(
        throwError(() => ({
          code: GrpcStatus.UNIMPLEMENTED,
          details: 'Method not implemented',
        })),
      );

      await expect(
        service.guardarBuild({
          nombreBuild: 'Mi PC Gamer',
          cpuId: 'cpu-1',
          gpuId: 'gpu-1',
          motherboardId: 'mb-1',
          ramId: 'ram-1',
          psuId: 'psu-1',
          resolucion: '1080p',
          consumoTotalWatts: 350,
        }),
      ).rejects.toThrow(NotImplementedException);
    });

    it('debe mapear INVALID_ARGUMENT (3) a BadRequestException (400)', async () => {
      mockGrpcClient.simularRendimiento.mockReturnValue(
        throwError(() => ({
          code: GrpcStatus.INVALID_ARGUMENT,
          details: 'Argumento inválido',
        })),
      );

      await expect(
        service.simular({
          cpuTdpWatts: 65,
          cpuBenchmarkScore: 25000,
          gpuTdpWatts: 200,
          gpuBenchmarkScore: 25000,
          psuWatts: 650,
          resolucion: '1080p',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe mapear DEADLINE_EXCEEDED (4) y TimeoutError a GatewayTimeoutException (504)', async () => {
      mockGrpcClient.simularRendimiento.mockReturnValue(
        throwError(() => ({ code: GrpcStatus.DEADLINE_EXCEEDED })),
      );

      await expect(
        service.simular({
          cpuTdpWatts: 65,
          cpuBenchmarkScore: 25000,
          gpuTdpWatts: 200,
          gpuBenchmarkScore: 25000,
          psuWatts: 650,
          resolucion: '1080p',
        }),
      ).rejects.toThrow(GatewayTimeoutException);

      mockGrpcClient.simularRendimiento.mockReturnValue(
        throwError(() => new TimeoutError()),
      );

      await expect(
        service.simular({
          cpuTdpWatts: 65,
          cpuBenchmarkScore: 25000,
          gpuTdpWatts: 200,
          gpuBenchmarkScore: 25000,
          psuWatts: 650,
          resolucion: '1080p',
        }),
      ).rejects.toThrow(GatewayTimeoutException);
    });

    it('debe mapear NOT_FOUND (5) a NotFoundException (404)', async () => {
      mockGrpcClient.simularRendimiento.mockReturnValue(
        throwError(() => ({ code: GrpcStatus.NOT_FOUND, details: 'No existe' })),
      );

      await expect(
        service.simular({
          cpuTdpWatts: 65,
          cpuBenchmarkScore: 25000,
          gpuTdpWatts: 200,
          gpuBenchmarkScore: 25000,
          psuWatts: 650,
          resolucion: '1080p',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe mapear UNAVAILABLE (14) a ServiceUnavailableException (503)', async () => {
      mockGrpcClient.simularRendimiento.mockReturnValue(
        throwError(() => ({ code: GrpcStatus.UNAVAILABLE })),
      );

      await expect(
        service.simular({
          cpuTdpWatts: 65,
          cpuBenchmarkScore: 25000,
          gpuTdpWatts: 200,
          gpuBenchmarkScore: 25000,
          psuWatts: 650,
          resolucion: '1080p',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('debe mapear INTERNAL (13) a BadGatewayException (502)', async () => {
      mockGrpcClient.simularRendimiento.mockReturnValue(
        throwError(() => ({
          code: GrpcStatus.INTERNAL,
          details: 'Fallo interno',
        })),
      );

      await expect(
        service.simular({
          cpuTdpWatts: 65,
          cpuBenchmarkScore: 25000,
          gpuTdpWatts: 200,
          gpuBenchmarkScore: 25000,
          psuWatts: 650,
          resolucion: '1080p',
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});
