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
}

export interface GuardarBuildResponse {
  build_id: string;
  success: boolean;
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
}
