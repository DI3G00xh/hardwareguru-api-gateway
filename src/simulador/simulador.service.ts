import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  NotImplementedException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable, TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { CatalogoService } from '../catalogo/catalogo.service';
import type { GuardarBuildDto, SimularDto } from './dto/simular.dto';
import type {
  BuildDetalle,
  BuildDetalleGateway,
  BuildFrontendResponse,
  EliminarBuildGatewayResponse,
  EstadoSimulacionFrontend,
  GuardarBuildGatewayResponse,
  GuardarBuildRequest,
  SimulacionFrontendResponse,
  SimulacionRequest,
  SimulacionResultadoGateway,
  SimulatorServiceClient,
} from './interfaces/simulador.interface';

const GRPC_DEADLINE_MS = 3000;

interface ComponentSpecLookup {
  nombre?: string;
  tdp?: unknown;
  potenciaW?: unknown;
  especificaciones?: Record<string, unknown>;
  benchmarks?: Record<string, unknown>;
}

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

    const response = await this.callGrpc((metadata, options) =>
      this.simulatorClient.simularRendimiento(
        requestPayload,
        metadata,
        options,
      ),
    );

    return {
      consumoTotalWatts: response.consumo_total_watts,
      cuelloBotellaPorcentaje: response.cuello_botella_porcentaje,
      estado: response.estado,
      motivo: response.motivo,
    };
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
    const estado = this.mapEstadoFrontend(resultado.estado);

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
    const { payload } = await this.prepareGuardarBuildPayload(
      dto,
      authenticatedUserId,
    );

    const response = await this.callGrpc((metadata, options) =>
      this.simulatorClient.guardarBuild(payload, metadata, options),
    );

    return {
      buildId: response.build_id,
      success: response.success,
      mensaje: response.mensaje ?? '',
    };
  }

  async listarBuilds(userId?: string): Promise<BuildDetalleGateway[]> {
    const resolvedUserId = this.requireAuthenticatedUserId(userId);
    const response = await this.callGrpc((metadata, options) =>
      this.simulatorClient.listarBuilds(
        { user_id: resolvedUserId },
        metadata,
        options,
      ),
    );

    return (response?.builds ?? []).map((build) => this.mapBuildDetalle(build));
  }

  async eliminarBuild(
    buildId: string,
    userId?: string,
  ): Promise<EliminarBuildGatewayResponse> {
    const cleanBuildId = buildId?.trim();
    if (!cleanBuildId) {
      throw new BadRequestException('El build_id es obligatorio');
    }
    if (!/^\d+$/.test(cleanBuildId)) {
      throw new BadRequestException('El build_id debe ser numérico');
    }

    const resolvedUserId = this.requireAuthenticatedUserId(userId);
    const response = await this.callGrpc((metadata, options) =>
      this.simulatorClient.eliminarBuild(
        { build_id: cleanBuildId, user_id: resolvedUserId },
        metadata,
        options,
      ),
    );

    return {
      success: response.success,
      mensaje: response.mensaje ?? '',
    };
  }

  async guardarBuildParaFrontend(
    dto: GuardarBuildDto,
    authenticatedUserId?: string,
  ): Promise<BuildFrontendResponse> {
    const resolvedUserId = this.requireAuthenticatedUserId(authenticatedUserId);

    const cpuId = dto.cpuId ?? dto.cpu_id ?? '';
    const motherboardId =
      dto.motherboardId ?? dto.motherboard_id ?? dto.placaId ?? dto.placa_id ?? '';
    const ramId = dto.ramId ?? dto.ram_id ?? '';
    const gpuId = dto.gpuId ?? dto.gpu_id ?? '';
    const psuId = dto.psuId ?? dto.psu_id ?? dto.fuenteId ?? dto.fuente_id ?? '';

    if (cpuId && motherboardId && ramId && psuId) {
      const compat = await this.catalogoService.verificarCompatibilidad({
        cpu_id: cpuId,
        motherboard_id: motherboardId,
        ram_id: ramId,
        gpu_id: gpuId,
        psu_id: psuId,
        ram_cantidad: dto.ramCantidad ?? dto.ram_cantidad ?? 1,
      });

      if (!compat.compatible) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: 'INCOMPATIBLE_BUILD',
          message:
            compat.errores.join(' ') ||
            'La configuración seleccionada no es compatible.',
        });
      }
    }

    const { payload, motivo } = await this.prepareGuardarBuildPayload(
      dto,
      resolvedUserId,
    );

    const response = await this.callGrpc((metadata, options) =>
      this.simulatorClient.guardarBuild(payload, metadata, options),
    );

    return this.toBuildFrontendResponse(
      {
        id: response.build_id,
        userId: payload.user_id,
        nombreBuild: payload.nombre_build || 'Mi Build',
        cpuId: payload.cpu_id,
        gpuId: payload.gpu_id,
        motherboardId: payload.motherboard_id,
        ramId: payload.ram_id,
        psuId: payload.psu_id,
        cpuNombre: payload.cpu_nombre ?? '',
        placaMadreNombre: payload.placa_madre_nombre ?? '',
        ramNombre: payload.ram_nombre ?? '',
        gpuNombre: payload.gpu_nombre ?? '',
        fuenteNombre: payload.fuente_nombre ?? '',
        cpuTdpWatts: payload.cpu_tdp_watts ?? 0,
        gpuTdpWatts: payload.gpu_tdp_watts ?? 0,
        psuWatts: payload.psu_watts ?? 0,
        resolucion: payload.resolucion,
        consumoTotalWatts: payload.consumo_total_watts,
        cuelloBotellaPorcentaje: payload.cuello_botella_porcentaje ?? 0,
        estadoRiesgo: payload.estado_riesgo ?? 'Óptimo',
        fechaCreacion: new Date().toISOString(),
      },
      motivo,
    );
  }

  async listarBuildsParaFrontend(
    userId?: string,
  ): Promise<BuildFrontendResponse[]> {
    const builds = await this.listarBuilds(userId);
    return builds.map((build) => this.toBuildFrontendResponse(build));
  }

  private async prepareGuardarBuildPayload(
    dto: GuardarBuildDto,
    authenticatedUserId?: string,
  ): Promise<{ payload: GuardarBuildRequest; motivo: string | null }> {
    const resolucion = dto.resolucion?.trim();
    if (!resolucion) {
      throw new BadRequestException('El campo resolucion es obligatorio');
    }

    const userId = this.resolveUserId(
      authenticatedUserId,
      dto.userId ?? dto.user_id,
    );

    const cpuId = (dto.cpuId ?? dto.cpu_id ?? '').trim();
    const gpuId = (dto.gpuId ?? dto.gpu_id ?? '').trim();
    const motherboardId = (
      dto.motherboardId ??
      dto.motherboard_id ??
      dto.placaId ??
      dto.placa_id ??
      ''
    ).trim();
    const ramId = (dto.ramId ?? dto.ram_id ?? '').trim();
    const psuId = (
      dto.psuId ??
      dto.psu_id ??
      dto.fuenteId ??
      dto.fuente_id ??
      ''
    ).trim();

    let cpuNombre = (dto.cpuNombre ?? dto.cpu_nombre)?.trim();
    let placaMadreNombre = (
      dto.placaMadreNombre ??
      dto.placa_madre_nombre ??
      dto.motherboardNombre ??
      dto.motherboard_nombre ??
      dto.placaNombre ??
      dto.placa_nombre
    )?.trim();
    let ramNombre = (dto.ramNombre ?? dto.ram_nombre)?.trim();
    let gpuNombre = (dto.gpuNombre ?? dto.gpu_nombre)?.trim();
    let fuenteNombre = (
      dto.fuenteNombre ??
      dto.fuente_nombre ??
      dto.psuNombre ??
      dto.psu_nombre
    )?.trim();

    let cpuTdpWatts = dto.cpuTdpWatts ?? dto.cpu_tdp_watts;
    let gpuTdpWatts = dto.gpuTdpWatts ?? dto.gpu_tdp_watts;
    let psuWatts = dto.psuWatts ?? dto.psu_watts;
    let consumoTotalWatts = dto.consumoTotalWatts ?? dto.consumo_total_watts;
    let cuelloBotellaPorcentaje =
      dto.cuelloBotellaPorcentaje ?? dto.cuello_botella_porcentaje;
    let estadoRiesgo = (dto.estadoRiesgo ?? dto.estado_riesgo)?.trim();
    let motivoSimulacion: string | null = null;

    const needsSimMetrics =
      consumoTotalWatts === undefined ||
      cuelloBotellaPorcentaje === undefined ||
      !estadoRiesgo;

    const needsCpu =
      Boolean(cpuId) &&
      (!cpuNombre || cpuTdpWatts === undefined || needsSimMetrics);
    const needsMb = Boolean(motherboardId) && !placaMadreNombre;
    const needsRam = Boolean(ramId) && !ramNombre;
    const needsGpu =
      Boolean(gpuId) &&
      (!gpuNombre || gpuTdpWatts === undefined || needsSimMetrics);
    const needsPsu =
      Boolean(psuId) &&
      (!fuenteNombre || psuWatts === undefined || needsSimMetrics);

    const [cpuSpec, mbSpec, ramSpec, gpuSpec, psuSpec] = await Promise.all([
      needsCpu ? this.obtenerSpecsOpcional(cpuId) : Promise.resolve(null),
      needsMb ? this.obtenerSpecsOpcional(motherboardId) : Promise.resolve(null),
      needsRam ? this.obtenerSpecsOpcional(ramId) : Promise.resolve(null),
      needsGpu ? this.obtenerSpecsOpcional(gpuId) : Promise.resolve(null),
      needsPsu ? this.obtenerSpecsOpcional(psuId) : Promise.resolve(null),
    ]);

    if (cpuSpec) {
      cpuNombre ||= cpuSpec.nombre?.trim();
      cpuTdpWatts ??= this.extractTdp(cpuSpec);
    }
    if (mbSpec) {
      placaMadreNombre ||= mbSpec.nombre?.trim();
    }
    if (ramSpec) {
      ramNombre ||= ramSpec.nombre?.trim();
    }
    if (gpuSpec) {
      gpuNombre ||= gpuSpec.nombre?.trim();
      gpuTdpWatts ??= this.extractTdp(gpuSpec);
    }
    if (psuSpec) {
      fuenteNombre ||= psuSpec.nombre?.trim();
      psuWatts ??= this.extractPsuWatts(psuSpec);
    }

    if (needsSimMetrics) {
      const cpuScore = this.extractCpuBenchmarkScore(cpuSpec?.benchmarks);
      const gpuScore = this.extractGpuBenchmarkScore(gpuSpec?.benchmarks);

      if (
        cpuTdpWatts !== undefined &&
        gpuTdpWatts !== undefined &&
        psuWatts !== undefined &&
        psuWatts > 0 &&
        cpuScore !== undefined &&
        gpuScore !== undefined
      ) {
        try {
          const sim = await this.callGrpc((metadata, options) =>
            this.simulatorClient.simularRendimiento(
              {
                cpu_tdp_watts: Math.round(cpuTdpWatts),
                cpu_benchmark_score: Math.round(cpuScore),
                gpu_tdp_watts: Math.round(gpuTdpWatts),
                gpu_benchmark_score: Math.round(gpuScore),
                resolucion,
                psu_watts: Math.round(psuWatts),
                user_id: '0',
              },
              metadata,
              options,
            ),
          );
          consumoTotalWatts ??= sim.consumo_total_watts;
          cuelloBotellaPorcentaje ??= sim.cuello_botella_porcentaje;
          estadoRiesgo ||= sim.estado;
          motivoSimulacion = sim.estado === 'Óptimo' ? null : sim.motivo;
        } catch {
          // Si la pre-simulación falla, continúa con los valores disponibles sin bloquear el guardado
        }
      }
    }

    const payload: GuardarBuildRequest = {
      user_id: userId,
      nombre_build: (
        dto.nombreBuild ??
        dto.nombre_build ??
        dto.nombre ??
        ''
      ).trim(),
      cpu_id: cpuId,
      gpu_id: gpuId,
      motherboard_id: motherboardId,
      ram_id: ramId,
      psu_id: psuId,
      resolucion,
      consumo_total_watts:
        consumoTotalWatts !== undefined ? Math.round(consumoTotalWatts) : 0,
      cpu_nombre: cpuNombre ?? '',
      placa_madre_nombre: placaMadreNombre ?? '',
      ram_nombre: ramNombre ?? '',
      gpu_nombre: gpuNombre ?? '',
      fuente_nombre: fuenteNombre ?? '',
      cpu_tdp_watts: cpuTdpWatts !== undefined ? Math.round(cpuTdpWatts) : 0,
      gpu_tdp_watts: gpuTdpWatts !== undefined ? Math.round(gpuTdpWatts) : 0,
      psu_watts: psuWatts !== undefined ? Math.round(psuWatts) : 0,
      cuello_botella_porcentaje:
        cuelloBotellaPorcentaje !== undefined
          ? Math.round(cuelloBotellaPorcentaje)
          : 0,
      estado_riesgo: estadoRiesgo || 'Óptimo',
    };

    return { payload, motivo: motivoSimulacion };
  }

  private async obtenerSpecsOpcional(
    id: string,
  ): Promise<ComponentSpecLookup | null> {
    try {
      const spec = await this.catalogoService.obtenerSpecs(id);
      return (spec ?? null) as ComponentSpecLookup | null;
    } catch {
      return null;
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
        cpuTdpWatts ??= this.extractTdp(cpuSpec);
        cpuBenchmarkScore ??= this.extractCpuBenchmarkScore(cpuSpec.benchmarks);
      }

      if (gpuSpec) {
        gpuTdpWatts ??= this.extractTdp(gpuSpec);
        gpuBenchmarkScore ??= this.extractGpuBenchmarkScore(gpuSpec.benchmarks);
      }

      if (psuSpec) {
        psuWatts ??= this.extractPsuWatts(psuSpec);
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

  private mapBuildDetalle(build: BuildDetalle): BuildDetalleGateway {
    return {
      id: build.id,
      userId: build.user_id,
      nombreBuild: build.nombre_build,
      cpuId: build.cpu_id,
      gpuId: build.gpu_id,
      motherboardId: build.motherboard_id,
      ramId: build.ram_id,
      psuId: build.psu_id,
      cpuNombre: build.cpu_nombre,
      placaMadreNombre: build.placa_madre_nombre,
      ramNombre: build.ram_nombre,
      gpuNombre: build.gpu_nombre,
      fuenteNombre: build.fuente_nombre,
      cpuTdpWatts: build.cpu_tdp_watts ?? 0,
      gpuTdpWatts: build.gpu_tdp_watts ?? 0,
      psuWatts: build.psu_watts ?? 0,
      resolucion: build.resolucion,
      consumoTotalWatts: build.consumo_total_watts ?? 0,
      cuelloBotellaPorcentaje: build.cuello_botella_porcentaje ?? 0,
      estadoRiesgo: build.estado_riesgo,
      fechaCreacion: build.fecha_creacion,
    };
  }

  private toBuildFrontendResponse(
    build: BuildDetalleGateway,
    motivo?: string | null,
  ): BuildFrontendResponse {
    const estado = this.mapEstadoFrontend(build.estadoRiesgo);

    return {
      id: build.id,
      nombre: build.nombreBuild,
      creadaEn: build.fechaCreacion,
      resolucion: build.resolucion,
      piezas: {
        cpu: {
          id: build.cpuId,
          nombre: build.cpuNombre || build.cpuId,
          tdp: build.cpuTdpWatts,
        },
        placa: {
          id: build.motherboardId,
          nombre: build.placaMadreNombre || build.motherboardId,
        },
        ram: {
          id: build.ramId,
          nombre: build.ramNombre || build.ramId,
        },
        gpu: {
          id: build.gpuId,
          nombre: build.gpuNombre || build.gpuId,
          tdp: build.gpuTdpWatts,
        },
        fuente: {
          id: build.psuId,
          nombre: build.fuenteNombre || build.psuId,
          potenciaW: build.psuWatts,
        },
      },
      resultado: {
        consumoEstimadoW: build.consumoTotalWatts,
        cuelloBotellaPct: build.cuelloBotellaPorcentaje,
        resolucion: build.resolucion,
        estado,
        motivo:
          estado === 'BALANCEADO' ? null : (motivo ?? build.estadoRiesgo),
      },
    };
  }

  private mapEstadoFrontend(estado?: string): EstadoSimulacionFrontend {
    const normalized = estado?.trim();
    if (normalized === 'Óptimo' || normalized === 'BALANCEADO') {
      return 'BALANCEADO';
    }
    if (normalized === 'INCOMPATIBLE') {
      return 'INCOMPATIBLE';
    }
    return 'RIESGO';
  }

  private requireAuthenticatedUserId(userId?: string): string {
    const resolved = userId?.trim();
    if (!resolved || resolved === '0') {
      throw new UnauthorizedException('Token de usuario requerido');
    }
    return resolved;
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

  private extractTdp(spec: ComponentSpecLookup): number | undefined {
    return (
      this.toPositiveOrZeroInt(spec.tdp) ??
      this.toPositiveOrZeroInt(spec.especificaciones?.tdp)
    );
  }

  private extractPsuWatts(spec: ComponentSpecLookup): number | undefined {
    return (
      this.toPositiveInt(spec.potenciaW) ??
      this.toPositiveInt(spec.especificaciones?.potenciaW) ??
      this.toPositiveInt(spec.especificaciones?.potencia_w)
    );
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

  private async callGrpc<T>(
    invoke: (metadata: Metadata, options: { deadline: Date }) => Observable<T>,
  ): Promise<T> {
    try {
      const deadline = new Date(Date.now() + GRPC_DEADLINE_MS);
      return await firstValueFrom(
        invoke(new Metadata(), { deadline }).pipe(timeout(GRPC_DEADLINE_MS)),
      );
    } catch (error) {
      this.handleGrpcError(error);
    }
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
      case GrpcStatus.PERMISSION_DENIED:
        throw new ForbiddenException(detail);
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
