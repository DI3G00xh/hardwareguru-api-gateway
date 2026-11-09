import {
  Injectable,
  OnModuleInit,
  Inject,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type {
  CatalogoServiceClient,
  BuildRequest,
} from './interfaces/catalogo.interface';

@Injectable()
export class CatalogoService implements OnModuleInit {
  private catalogoClient: CatalogoServiceClient;

  constructor(@Inject('CATALOGO_PACKAGE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.catalogoClient = this.client.getService<CatalogoServiceClient>('CatalogoService');
  }

  async listarComponentes(tipo?: string) {
    try {
      const response = await firstValueFrom(
        this.catalogoClient.listarComponentes({ tipo: tipo || '' }),
      );
      return response?.componentes || [];
    } catch (error) {
      this.handleGrpcError(error);
    }
  }

  async obtenerSpecs(id: string) {
    try {
      const response = await firstValueFrom(
        this.catalogoClient.obtenerSpecs({ id }),
      );

      // Deserializar especificaciones y benchmarks para entregar JSON nativo al Frontend
      let especificaciones: Record<string, any> = {};
      let benchmarks: Record<string, any> = {};

      try {
        if (response.especificaciones_json) {
          especificaciones = JSON.parse(response.especificaciones_json);
        }
      } catch {
        especificaciones = {};
      }

      try {
        if (response.benchmarks_json) {
          benchmarks = JSON.parse(response.benchmarks_json);
        }
      } catch {
        benchmarks = {};
      }

      return {
        id: response.id,
        tipo: response.tipo,
        nombre: response.nombre,
        fabricante: response.fabricante,
        tdp: response.tdp,
        socket: response.socket || undefined,
        tipoRam: response.tipo_ram || undefined,
        potenciaW: response.potencia_w,
        origen: response.origen,
        especificaciones,
        benchmarks,
      };
    } catch (error) {
      this.handleGrpcError(error);
    }
  }

  async verificarCompatibilidad(build: BuildRequest) {
    try {
      const rawBuild = (build as any)?.build ?? build;
      const cpu = rawBuild.cpu_id || rawBuild.cpuId || '';
      const mb = rawBuild.motherboard_id || rawBuild.motherboardId || '';
      const ram = rawBuild.ram_id || rawBuild.ramId || '';
      const gpu = rawBuild.gpu_id || rawBuild.gpuId || '';
      const psu = rawBuild.psu_id || rawBuild.psuId || '';
      const cant = Number(rawBuild.ram_cantidad ?? rawBuild.ramCantidad ?? 1);

      const buildPayload: BuildRequest = {
        cpu_id: cpu,
        motherboard_id: mb,
        ram_id: ram,
        gpu_id: gpu,
        psu_id: psu,
        ram_cantidad: cant,
      };

      const response = await firstValueFrom(
        this.catalogoClient.verificarCompatibilidad({ build: buildPayload }),
      );
      return {
        compatible: response.compatible,
        errores: response.errores || [],
        consumoEstimadoW: response.consumo_estimado_w,
      };
    } catch (error) {
      this.handleGrpcError(error);
    }
  }

  private handleGrpcError(error: any): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error?.code === 5) {
      throw new NotFoundException(error.details || 'Componente no encontrado');
    }
    if (error?.code === 3) {
      throw new BadRequestException(error.details || 'Datos de solicitud inválidos');
    }
    throw new InternalServerErrorException(
      error?.details || error?.message || 'Error interno de comunicación gRPC',
    );
  }
}
