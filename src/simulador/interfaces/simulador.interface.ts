import type { CallOptions, Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';

export interface SimulacionRequest {
  cpu_tdp_watts: number;
  cpu_benchmark_score: number;
  gpu_tdp_watts: number;
  gpu_benchmark_score: number;
  resolucion: string;
  psu_watts: number;
  user_id: string;
}

export interface SimulacionResponse {
  consumo_total_watts: number;
  cuello_botella_porcentaje: number;
  estado: string;
  motivo: string;
}

export interface GuardarBuildRequest {
  user_id: string;
  nombre_build: string;
  cpu_id: string;
  gpu_id: string;
  motherboard_id: string;
  ram_id: string;
  psu_id: string;
  resolucion: string;
  consumo_total_watts: number;
  cpu_nombre?: string;
  placa_madre_nombre?: string;
  ram_nombre?: string;
  gpu_nombre?: string;
  fuente_nombre?: string;
  cpu_tdp_watts?: number;
  gpu_tdp_watts?: number;
  psu_watts?: number;
  cuello_botella_porcentaje?: number;
  estado_riesgo?: string;
}

export interface GuardarBuildResponse {
  build_id: string;
  success: boolean;
  mensaje?: string;
}

export interface BuildDetalle {
  id: string;
  user_id: string;
  nombre_build: string;
  cpu_id: string;
  gpu_id: string;
  motherboard_id: string;
  ram_id: string;
  psu_id: string;
  cpu_nombre: string;
  placa_madre_nombre: string;
  ram_nombre: string;
  gpu_nombre: string;
  fuente_nombre: string;
  cpu_tdp_watts: number;
  gpu_tdp_watts: number;
  psu_watts: number;
  resolucion: string;
  consumo_total_watts: number;
  cuello_botella_porcentaje: number;
  estado_riesgo: string;
  fecha_creacion: string;
}

export interface ListarBuildsRequest {
  user_id: string;
}

export interface ListarBuildsResponse {
  builds?: BuildDetalle[];
}

export interface EliminarBuildRequest {
  build_id: string;
  user_id: string;
}

export interface EliminarBuildResponse {
  success: boolean;
  mensaje?: string;
}

export interface SimulatorServiceClient {
  simularRendimiento(
    data: SimulacionRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<SimulacionResponse>;
  guardarBuild(
    data: GuardarBuildRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<GuardarBuildResponse>;
  listarBuilds(
    data: ListarBuildsRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<ListarBuildsResponse>;
  eliminarBuild(
    data: EliminarBuildRequest,
    metadata?: Metadata,
    options?: CallOptions,
  ): Observable<EliminarBuildResponse>;
}

export interface SimulacionResultadoGateway {
  consumoTotalWatts: number;
  cuelloBotellaPorcentaje: number;
  estado: string;
  motivo: string;
}

export type EstadoSimulacionFrontend =
  | 'BALANCEADO'
  | 'RIESGO'
  | 'INCOMPATIBLE';

export interface SimulacionFrontendResponse {
  consumoEstimadoW: number;
  cuelloBotellaPct: number;
  resolucion: string;
  estado: EstadoSimulacionFrontend;
  motivo: string | null;
}

export interface GuardarBuildGatewayResponse {
  buildId: string;
  success: boolean;
  mensaje: string;
}

export interface BuildDetalleGateway {
  id: string;
  userId: string;
  nombreBuild: string;
  cpuId: string;
  gpuId: string;
  motherboardId: string;
  ramId: string;
  psuId: string;
  cpuNombre: string;
  placaMadreNombre: string;
  ramNombre: string;
  gpuNombre: string;
  fuenteNombre: string;
  cpuTdpWatts: number;
  gpuTdpWatts: number;
  psuWatts: number;
  resolucion: string;
  consumoTotalWatts: number;
  cuelloBotellaPorcentaje: number;
  estadoRiesgo: string;
  fechaCreacion: string;
}

export interface EliminarBuildGatewayResponse {
  success: boolean;
  mensaje: string;
}

export interface PiezaResumenFrontend {
  id: string;
  nombre: string;
  tdp?: number;
  potenciaW?: number;
}

export interface BuildFrontendResponse {
  id: string;
  nombre: string;
  creadaEn: string;
  resolucion: string;
  piezas: {
    cpu: PiezaResumenFrontend;
    placa: PiezaResumenFrontend;
    ram: PiezaResumenFrontend;
    gpu: PiezaResumenFrontend;
    fuente: PiezaResumenFrontend;
  };
  resultado: SimulacionFrontendResponse;
}
