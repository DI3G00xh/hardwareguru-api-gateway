import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SimularDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  cpuTdpWatts?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  cpuBenchmarkScore?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  gpuTdpWatts?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  gpuBenchmarkScore?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  psuWatts?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  cpu_tdp_watts?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  cpu_benchmark_score?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  gpu_tdp_watts?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  gpu_benchmark_score?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  psu_watts?: number;

  @IsString()
  @IsOptional()
  cpuId?: string;

  @IsString()
  @IsOptional()
  gpuId?: string;

  @IsString()
  @IsOptional()
  psuId?: string;

  @IsString()
  @IsOptional()
  fuenteId?: string;

  @IsString()
  @IsOptional()
  motherboardId?: string;

  @IsString()
  @IsOptional()
  placaId?: string;

  @IsString()
  @IsOptional()
  ramId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  ramCantidad?: number;

  @IsString()
  @IsOptional()
  cpu_id?: string;

  @IsString()
  @IsOptional()
  gpu_id?: string;

  @IsString()
  @IsOptional()
  psu_id?: string;

  @IsString()
  @IsOptional()
  fuente_id?: string;

  @IsString()
  @IsOptional()
  motherboard_id?: string;

  @IsString()
  @IsOptional()
  placa_id?: string;

  @IsString()
  @IsOptional()
  ram_id?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  ram_cantidad?: number;

  
  @IsString()
  @IsNotEmpty()
  resolucion: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  user_id?: string;
}

export class GuardarBuildDto {
  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  user_id?: string;

  @IsString()
  @IsOptional()
  nombreBuild?: string;

  @IsString()
  @IsOptional()
  nombre_build?: string;

  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  cpuId?: string;

  @IsString()
  @IsOptional()
  cpu_id?: string;

  @IsString()
  @IsOptional()
  gpuId?: string;

  @IsString()
  @IsOptional()
  gpu_id?: string;

  @IsString()
  @IsOptional()
  motherboardId?: string;

  @IsString()
  @IsOptional()
  motherboard_id?: string;

  @IsString()
  @IsOptional()
  placaId?: string;

  @IsString()
  @IsOptional()
  placa_id?: string;

  @IsString()
  @IsOptional()
  ramId?: string;

  @IsString()
  @IsOptional()
  ram_id?: string;

  @IsString()
  @IsOptional()
  psuId?: string;

  @IsString()
  @IsOptional()
  psu_id?: string;

  @IsString()
  @IsOptional()
  fuenteId?: string;

  @IsString()
  @IsOptional()
  fuente_id?: string;

  @IsString()
  @IsNotEmpty()
  resolucion: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  consumoTotalWatts?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  consumo_total_watts?: number;

  @IsString()
  @IsOptional()
  cpuNombre?: string;

  @IsString()
  @IsOptional()
  cpu_nombre?: string;

  @IsString()
  @IsOptional()
  placaMadreNombre?: string;

  @IsString()
  @IsOptional()
  placa_madre_nombre?: string;

  @IsString()
  @IsOptional()
  motherboardNombre?: string;

  @IsString()
  @IsOptional()
  motherboard_nombre?: string;

  @IsString()
  @IsOptional()
  placaNombre?: string;

  @IsString()
  @IsOptional()
  placa_nombre?: string;

  @IsString()
  @IsOptional()
  ramNombre?: string;

  @IsString()
  @IsOptional()
  ram_nombre?: string;

  @IsString()
  @IsOptional()
  gpuNombre?: string;

  @IsString()
  @IsOptional()
  gpu_nombre?: string;

  @IsString()
  @IsOptional()
  fuenteNombre?: string;

  @IsString()
  @IsOptional()
  fuente_nombre?: string;

  @IsString()
  @IsOptional()
  psuNombre?: string;

  @IsString()
  @IsOptional()
  psu_nombre?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  cpuTdpWatts?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  cpu_tdp_watts?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  gpuTdpWatts?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  gpu_tdp_watts?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  psuWatts?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  psu_watts?: number;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  cuelloBotellaPorcentaje?: number;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  cuello_botella_porcentaje?: number;

  @IsString()
  @IsOptional()
  estadoRiesgo?: string;

  @IsString()
  @IsOptional()
  estado_riesgo?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  ramCantidad?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  ram_cantidad?: number;
}
