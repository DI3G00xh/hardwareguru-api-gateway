import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { CatalogoService } from './catalogo.service';

describe('CatalogoService', () => {
  let service: CatalogoService;
  let mockGrpcClient: {
    listarComponentes: jest.Mock<any>;
    obtenerSpecs: jest.Mock<any>;
    verificarCompatibilidad: jest.Mock<any>;
  };

  beforeEach(async () => {
    mockGrpcClient = {
      listarComponentes: jest.fn(),
      obtenerSpecs: jest.fn(),
      verificarCompatibilidad: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogoService,
        {
          provide: 'CATALOGO_PACKAGE',
          useValue: {
            getService: jest.fn().mockReturnValue(mockGrpcClient),
          },
        },
      ],
    }).compile();

    service = module.get<CatalogoService>(CatalogoService);
    service.onModuleInit();
  });

  describe('listarComponentes', () => {
    it('debe listar componentes filtrando por tipo', async () => {
      const mockResponse = {
        componentes: [
          {
            id: 'cpu-1',
            tipo: 'cpu',
            nombre: 'AMD Ryzen 5 5600X',
            fabricante: 'AMD',
            tdp: 65,
            socket: 'AM4',
            tipo_ram: 'DDR4',
            potencia_w: 65,
            origen: 'catalogo',
          },
        ],
      };

      mockGrpcClient.listarComponentes.mockReturnValue(of(mockResponse));

      const result = await service.listarComponentes('cpu');

      expect(mockGrpcClient.listarComponentes).toHaveBeenCalledWith({
        tipo: 'cpu',
      });
      expect(result).toEqual(mockResponse.componentes);
    });

    it('debe pasar cadena vacia si tipo no se especifica', async () => {
      mockGrpcClient.listarComponentes.mockReturnValue(
        of({ componentes: [] }),
      );

      const result = await service.listarComponentes();

      expect(mockGrpcClient.listarComponentes).toHaveBeenCalledWith({
        tipo: '',
      });
      expect(result).toEqual([]);
    });
  });

  describe('obtenerSpecs', () => {
    it('debe parsear especificaciones_json y benchmarks_json correctamente', async () => {
      const mockGrpcResponse = {
        id: 'cpu-1',
        tipo: 'cpu',
        nombre: 'AMD Ryzen 5 5600X',
        fabricante: 'AMD',
        tdp: 65,
        socket: 'AM4',
        tipo_ram: 'DDR4',
        potencia_w: 65,
        origen: 'catalogo',
        especificaciones_json: '{"nucleos":6,"hilos":12}',
        benchmarks_json: '{"cinebench_r23":11200}',
      };

      mockGrpcClient.obtenerSpecs.mockReturnValue(of(mockGrpcResponse));

      const result = await service.obtenerSpecs('cpu-1');

      expect(mockGrpcClient.obtenerSpecs).toHaveBeenCalledWith({ id: 'cpu-1' });
      expect(result).toEqual({
        id: 'cpu-1',
        tipo: 'cpu',
        nombre: 'AMD Ryzen 5 5600X',
        fabricante: 'AMD',
        tdp: 65,
        socket: 'AM4',
        tipoRam: 'DDR4',
        potenciaW: 65,
        origen: 'catalogo',
        especificaciones: { nucleos: 6, hilos: 12 },
        benchmarks: { cinebench_r23: 11200 },
      });
    });

    it('debe tolerar JSON invalido devolviendo objetos vacios', async () => {
      const mockGrpcResponse = {
        id: 'gpu-1',
        tipo: 'gpu',
        nombre: 'RTX 4070',
        fabricante: 'NVIDIA',
        tdp: 200,
        socket: '',
        tipo_ram: '',
        potencia_w: 200,
        origen: 'catalogo',
        especificaciones_json: 'invalid json',
        benchmarks_json: '',
      };

      mockGrpcClient.obtenerSpecs.mockReturnValue(of(mockGrpcResponse));

      const result = await service.obtenerSpecs('gpu-1');

      expect(result?.especificaciones).toEqual({});
      expect(result?.benchmarks).toEqual({});
    });
  });

  describe('verificarCompatibilidad', () => {
    it('debe verificar compatibilidad de un build correctamente', async () => {
      const mockBuild = {
        cpu_id: 'cpu-1',
        motherboard_id: 'mb-1',
        ram_id: 'ram-1',
        gpu_id: 'gpu-1',
        psu_id: 'psu-1',
        ram_cantidad: 2,
      };

      const mockResponse = {
        compatible: true,
        errores: [],
        consumo_estimado_w: 450,
      };

      mockGrpcClient.verificarCompatibilidad.mockReturnValue(of(mockResponse));

      const result = await service.verificarCompatibilidad(mockBuild);

      expect(mockGrpcClient.verificarCompatibilidad).toHaveBeenCalledWith({
        build: mockBuild,
      });
      expect(result).toEqual({
        compatible: true,
        errores: [],
        consumoEstimadoW: 450,
      });
    });

    it('debe soportar datos con camelCase', async () => {
      const mockBuildCamel = {
        cpuId: 'cpu-1',
        motherboardId: 'mb-1',
        ramId: 'ram-1',
        gpuId: 'gpu-1',
        psuId: 'psu-1',
        ramCantidad: 4,
      };

      const mockResponse = {
        compatible: false,
        errores: ['Socket incompatible: AM4 vs LGA1700'],
        consumo_estimado_w: 500,
      };

      mockGrpcClient.verificarCompatibilidad.mockReturnValue(of(mockResponse));

      const result = await service.verificarCompatibilidad(mockBuildCamel);

      expect(mockGrpcClient.verificarCompatibilidad).toHaveBeenCalledWith({
        build: {
          cpu_id: 'cpu-1',
          motherboard_id: 'mb-1',
          ram_id: 'ram-1',
          gpu_id: 'gpu-1',
          psu_id: 'psu-1',
          ram_cantidad: 4,
        },
      });
      expect(result).toEqual({
        compatible: false,
        errores: ['Socket incompatible: AM4 vs LGA1700'],
        consumoEstimadoW: 500,
      });
    });
  });

  describe('Manejo de errores gRPC', () => {
    it('debe transformar codigo gRPC 5 a NotFoundException', async () => {
      const grpcError = { code: 5, details: 'Componente cpu-99 no encontrado' };
      mockGrpcClient.obtenerSpecs.mockReturnValue(throwError(() => grpcError));

      await expect(service.obtenerSpecs('cpu-99')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe transformar codigo gRPC 3 a BadRequestException', async () => {
      const grpcError = { code: 3, details: 'Faltan campos obligatorios' };
      mockGrpcClient.verificarCompatibilidad.mockReturnValue(
        throwError(() => grpcError),
      );

      await expect(
        service.verificarCompatibilidad({ cpu_id: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe transformar otros errores a InternalServerErrorException', async () => {
      const grpcError = { code: 14, details: 'Servicio no disponible' };
      mockGrpcClient.listarComponentes.mockReturnValue(
        throwError(() => grpcError),
      );

      await expect(service.listarComponentes()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
