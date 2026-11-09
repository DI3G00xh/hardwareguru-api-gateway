import { Observable } from 'rxjs';

export interface ComponenteResumen {
  id: string;
  tipo: string;
  nombre: string;
  fabricante: string;
  tdp: number;
  socket: string;
  tipo_ram: string;
  potencia_w: number;
  origen: string;
}

export interface ListarComponentesResponse {
  componentes: ComponenteResumen[];
}

export interface ComponenteDetalleResponse {
  id: string;
  tipo: string;
  nombre: string;
  fabricante: string;
  tdp: number;
  socket: string;
  tipo_ram: string;
  potencia_w: number;
  origen: string;
  especificaciones_json: string;
  benchmarks_json: string;
}

export interface BuildRequest {
  cpu_id?: string;
  motherboard_id?: string;
  ram_id?: string;
  gpu_id?: string;
  psu_id?: string;
  ram_cantidad?: number;
  // Soporte para camelCase desde Frontend
  cpuId?: string;
  motherboardId?: string;
  ramId?: string;
  gpuId?: string;
  psuId?: string;
  ramCantidad?: number;
}

export interface CompatibilidadResponse {
  compatible: boolean;
  errores: string[];
  consumo_estimado_w: number;
}

export interface CatalogoServiceClient {
  listarComponentes(data: { tipo: string }): Observable<ListarComponentesResponse>;
  obtenerSpecs(data: { id: string }): Observable<ComponenteDetalleResponse>;
  verificarCompatibilidad(data: { build: BuildRequest }): Observable<CompatibilidadResponse>;
}

