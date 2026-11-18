import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  NotImplementedException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import type { ClientGrpc } from '@nestjs/microservices';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { CatalogoService } from '../catalogo/catalogo.service';
import type { GuardarBuildDto, SimularDto } from './dto/simular.dto';
import type {
  EstadoSimulacionFrontend,
  GuardarBuildGatewayResponse,
  GuardarBuildRequest,
  SimulacionFrontendResponse,
  SimulacionRequest,
  SimulacionResultadoGateway,
  SimulatorServiceClient,
} from './interfaces/simulador.interface';

const GRPC_DEADLINE_MS = 3000;

@Injectable()
export class SimuladorService implements OnModuleInit {
  private simulatorClient: SimulatorServiceClient;

  constructor(
    @Inject('SIMULATOR_PACKAGE') private readonly client: ClientGrpc,
    private readonly catalogoService: CatalogoService,
  ) {}

  onModuleInit() {
    this.simulatorClient =
      this.client.getService<SimulatorServiceClient>('SimulatorService');
  }

  async simular(
    dto: SimularDto,
    authenticatedUserId?: string,
  ): Promise<SimulacionResultadoGateway> {
    const requestPayload = await this.buildSimulacionRequest(
      dto,
      authenticatedUserId,
    );

    try {
      const deadline = new Date(Date.now() + GRPC_DEADLINE_MS);
      const response = await firstValueFrom(
        this.simulatorClient
          .simularRendimiento(requestPayload, new Metadata(), { deadline })
          .pipe(timeout(GRPC_DEADLINE_MS)),
      );

      return {
        consumoTotalWatts: response.consumo_total_watts,
        cuelloBotellaPorcentaje: response.cuello_botella_porcentaje,
        estado: response.estado,
        motivo: response.motivo,
      };
    } catch (error) {
      this.handleGrpcError(error);
    }
  }

  async simularParaFrontend(
    dto: SimularDto,
    authenticatedUserId?: string,
  ): Promise<SimulacionFrontendResponse> {
    const resolucion = dto.resolucion?.trim();
    if (!resolucion) {
      throw new BadRequestException('El campo resolucion es obligatorio');
    }

    const cpuId = dto.cpuId ?? dto.cpu_id;
    const placaId =
      dto.placaId ?? dto.placa_id ?? dto.motherboardId ?? dto.motherboard_id;
    const ramId = dto.ramId ?? dto.ram_id;
    const gpuId = dto.gpuId ?? dto.gpu_id;
    const psuId = dto.psuId ?? dto.psu_id ?? dto.fuenteId ?? dto.fuente_id;

    if (cpuId && placaId && ramId && psuId) {
      const compat = await this.catalogoService.verificarCompatibilidad({
        cpu_id: cpuId,
        motherboard_id: placaId,
        ram_id: ramId,
        gpu_id: gpuId || '',
        psu_id: psuId,
        ram_cantidad: dto.ramCantidad ?? dto.ram_cantidad ?? 1,
      });

      if (!compat.compatible) {
        return {
          consumoEstimadoW: compat.consumoEstimadoW,
          cuelloBotellaPct: 0,
          resolucion,
          estado: 'INCOMPATIBLE',
          motivo:
            compat.errores.join(' ') ||
            'La configuración seleccionada no es compatible.',
        };
      }
    }

    const resultado = await this.simular(dto, authenticatedUserId);

    const estado: EstadoSimulacionFrontend =
      resultado.estado === 'Óptimo' ? 'BALANCEADO' : 'RIESGO';

    return {
      consumoEstimadoW: resultado.consumoTotalWatts,
      cuelloBotellaPct: resultado.cuelloBotellaPorcentaje,
      resolucion,
      estado,
      motivo: estado === 'BALANCEADO' ? null : resultado.motivo,
    };
  }

  async guardarBuild(
    dto: GuardarBuildDto,
    authenticatedUserId?: string,
  ): Promise<GuardarBuildGatewayResponse> {
    const resolucion = dto.resolucion?.trim();
    if (!resolucion) {
      throw new BadRequestException('El campo resolucion es obligatorio');
    }

    const userId = this.resolveUserId(
      authenticatedUserId,
      dto.userId ?? dto.user_id,
    );

    const payload: GuardarBuildRequest = {
      user_id: userId,
      nombre_build: (
        dto.nombreBuild ??
        dto.nombre_build ??
        dto.nombre ??
        ''
      ).trim(),
      cpu_id: dto.cpuId ?? dto.cpu_id ?? '',
      gpu_id: dto.gpuId ?? dto.gpu_id ?? '',
      motherboard_id:
        dto.motherboardId ??
        dto.motherboard_id ??
        dto.placaId ??
        dto.placa_id ??
        '',
      ram_id: dto.ramId ?? dto.ram_id ?? '',
      psu_id: dto.psuId ?? dto.psu_id ?? dto.fuenteId ?? dto.fuente_id ?? '',
      resolucion,
      consumo_total_watts:
        dto.consumoTotalWatts ?? dto.consumo_total_watts ?? 0,
    };

    try {
      const deadline = new Date(Date.now() + GRPC_DEADLINE_MS);
      const response = await firstValueFrom(
        this.simulatorClient
          .guardarBuild(payload, new Metadata(), { deadline })
          .pipe(timeout(GRPC_DEADLINE_MS)),
      );

      return {
        buildId: response.build_id,
        success: response.success,
      };
    } catch (error) {
      this.handleGrpcError(error);
    }
  }

  private async buildSimulacionRequest(
    dto: SimularDto,
    authenticatedUserId?: string,
  ): Promise<SimulacionRequest> {
    const resolucion = dto.resolucion?.trim();
    if (!resolucion) {
      throw new BadRequestException('El campo resolucion es obligatorio');
    }

    let cpuTdpWatts = dto.cpuTdpWatts ?? dto.cpu_tdp_watts;
    let cpuBenchmarkScore = dto.cpuBenchmarkScore ?? dto.cpu_benchmark_score;
    let gpuTdpWatts = dto.gpuTdpWatts ?? dto.gpu_tdp_watts;
    let gpuBenchmarkScore = dto.gpuBenchmarkScore ?? dto.gpu_benchmark_score;
    let psuWatts = dto.psuWatts ?? dto.psu_watts;

    const cpuId = dto.cpuId ?? dto.cpu_id;
    const gpuId = dto.gpuId ?? dto.gpu_id;
    const psuId = dto.psuId ?? dto.psu_id ?? dto.fuenteId ?? dto.fuente_id;

    const needsCpu = cpuTdpWatts === undefined || cpuBenchmarkScore === undefined;
    const needsGpu = gpuTdpWatts === undefined || gpuBenchmarkScore === undefined;
    const needsPsu = psuWatts === undefined;

    if ((needsCpu && cpuId) || (needsGpu && gpuId) || (needsPsu && psuId)) {
      const [cpuSpec, gpuSpec, psuSpec] = await Promise.all([
        needsCpu && cpuId
          ? this.catalogoService.obtenerSpecs(cpuId)
          : Promise.resolve(null),
        needsGpu && gpuId
          ? this.catalogoService.obtenerSpecs(gpuId)
          : Promise.resolve(null),
        needsPsu && psuId
          ? this.catalogoService.obtenerSpecs(psuId)
          : Promise.resolve(null),
      ]);

      if (cpuSpec) {
        cpuTdpWatts ??=
          this.toPositiveOrZeroInt(cpuSpec.tdp) ??
          this.toPositiveOrZeroInt(cpuSpec.especificaciones?.tdp);
        cpuBenchmarkScore ??= this.extractCpuBenchmarkScore(cpuSpec.benchmarks);
      }

      if (gpuSpec) {
        gpuTdpWatts ??=
          this.toPositiveOrZeroInt(gpuSpec.tdp) ??
          this.toPositiveOrZeroInt(gpuSpec.especificaciones?.tdp);
        gpuBenchmarkScore ??= this.extractGpuBenchmarkScore(gpuSpec.benchmarks);
      }

      if (psuSpec) {
        psuWatts ??=
          this.toPositiveInt(psuSpec.potenciaW) ??
          this.toPositiveInt(psuSpec.especificaciones?.potenciaW) ??
          this.toPositiveInt(psuSpec.especificaciones?.potencia_w);
      }
    }

    if (
      cpuTdpWatts === undefined ||
      !Number.isFinite(cpuTdpWatts) ||
      cpuTdpWatts < 0
    ) {
      throw new BadRequestException(
        'Parámetro inválido: cpu_tdp_watts debe ser un número mayor o igual a 0',
      );
    }

    if (
      gpuTdpWatts === undefined ||
      !Number.isFinite(gpuTdpWatts) ||
      gpuTdpWatts < 0
    ) {
      throw new BadRequestException(
        'Parámetro inválido: gpu_tdp_watts debe ser un número mayor o igual a 0',
      );
    }

    if (
      cpuBenchmarkScore === undefined ||
      !Number.isFinite(cpuBenchmarkScore) ||
      cpuBenchmarkScore <= 0
    ) {
      throw new BadRequestException(
        'Parámetro inválido: cpu_benchmark_score debe ser mayor a 0',
      );
    }

    if (
      gpuBenchmarkScore === undefined ||
      !Number.isFinite(gpuBenchmarkScore) ||
      gpuBenchmarkScore <= 0
    ) {
      throw new BadRequestException(
        'Parámetro inválido: gpu_benchmark_score debe ser mayor a 0',
      );
    }

    if (
      psuWatts === undefined ||
      !Number.isFinite(psuWatts) ||
      psuWatts <= 0
    ) {
      throw new BadRequestException(
        'Parámetro inválido: psu_watts debe ser mayor a 0',
      );
    }

    return {
      cpu_tdp_watts: Math.round(cpuTdpWatts),
      cpu_benchmark_score: Math.round(cpuBenchmarkScore),
      gpu_tdp_watts: Math.round(gpuTdpWatts),
      gpu_benchmark_score: Math.round(gpuBenchmarkScore),
      resolucion,
      psu_watts: Math.round(psuWatts),
      user_id: this.resolveUserId(
        authenticatedUserId,
        dto.userId ?? dto.user_id,
      ),
    };
  }

  private resolveUserId(
    authenticatedUserId?: string,
    fallbackUserId?: string,
  ): string {
    const authId = authenticatedUserId?.trim();
    if (authId) {
      return authId;
    }
    const bodyId = fallbackUserId?.trim();
    return bodyId || '0';
  }

  private extractCpuBenchmarkScore(
    benchmarks?: Record<string, unknown>,
  ): number | undefined {
    if (!benchmarks) return undefined;

    const directScore =
      this.toPositiveInt(benchmarks.passmark_cpu) ??
      this.toPositiveInt(benchmarks.passmarkCpu) ??
      this.toPositiveInt(benchmarks.passmark) ??
      this.toPositiveInt(benchmarks.benchmarkScore) ??
      this.toPositiveInt(benchmarks.score) ??
      this.toPositiveInt(benchmarks.cinebench_r23_multi) ??
      this.toPositiveInt(benchmarks.cinebenchR23Multi);

    if (directScore !== undefined) {
      return directScore;
    }

    // Cinebench R24 (aprox. 1000-2500) escalado x10 para alinear proporciones con TimeSpy/PassMark
    const cinebenchR24 =
      this.toPositiveInt(benchmarks.cinebenchR24) ??
      this.toPositiveInt(benchmarks.cinebench_r24);
    if (cinebenchR24 !== undefined) {
      return cinebenchR24 * 10;
    }

    return this.firstPositiveNumericValue(benchmarks);
  }

  private extractGpuBenchmarkScore(
    benchmarks?: Record<string, unknown>,
  ): number | undefined {
    if (!benchmarks) return undefined;

    const directScore =
      this.toPositiveInt(benchmarks.passmark_gpu) ??
      this.toPositiveInt(benchmarks.passmarkGpu) ??
      this.toPositiveInt(benchmarks.passmark) ??
      this.toPositiveInt(benchmarks.benchmarkScore) ??
      this.toPositiveInt(benchmarks.score) ??
      this.toPositiveInt(benchmarks.timespy) ??
      this.toPositiveInt(benchmarks.timeSpy) ??
      this.toPositiveInt(benchmarks['3dmark']);

    if (directScore !== undefined) {
      return directScore;
    }

    return this.firstPositiveNumericValue(benchmarks);
  }

  private firstPositiveNumericValue(
    record: Record<string, unknown>,
  ): number | undefined {
    for (const value of Object.values(record)) {
      const parsed = this.toPositiveInt(value);
      if (parsed !== undefined) {
        return parsed;
      }
    }
    return undefined;
  }

  private toPositiveInt(value: unknown): number | undefined {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return Math.round(num);
    }
    return undefined;
  }

  private toPositiveOrZeroInt(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) {
      return Math.round(num);
    }
    return undefined;
  }

  private handleGrpcError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error instanceof TimeoutError) {
      throw new GatewayTimeoutException(
        'Timeout al consultar el servicio simulador',
      );
    }

    const grpcError = error as {
      code?: number;
      details?: string;
      message?: string;
    };
    const detail =
      grpcError?.details || grpcError?.message || 'Error en comunicación gRPC';

    switch (grpcError?.code) {
      case GrpcStatus.INVALID_ARGUMENT:
        throw new BadRequestException(detail);
      case GrpcStatus.DEADLINE_EXCEEDED:
        throw new GatewayTimeoutException(
          'Timeout al consultar el servicio simulador',
        );
      case GrpcStatus.NOT_FOUND:
        throw new NotFoundException(detail);
      case GrpcStatus.UNIMPLEMENTED:
        throw new NotImplementedException(
          detail || 'Operación no implementada en el microservicio simulador',
        );
      case GrpcStatus.UNAVAILABLE:
        throw new ServiceUnavailableException(
          'Servicio simulador no disponible',
        );
      case GrpcStatus.INTERNAL:
      case GrpcStatus.UNKNOWN:
      default:
        throw new BadGatewayException(detail);
    }
  }
}
