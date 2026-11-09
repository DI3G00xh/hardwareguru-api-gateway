import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class BuildDto {
  @IsString()
  @IsOptional()
  cpu_id?: string;

  @IsString()
  @IsOptional()
  cpuId?: string;

  @IsString()
  @IsOptional()
  motherboard_id?: string;

  @IsString()
  @IsOptional()
  motherboardId?: string;

  @IsString()
  @IsOptional()
  ram_id?: string;

  @IsString()
  @IsOptional()
  ramId?: string;

  @IsString()
  @IsOptional()
  gpu_id?: string;

  @IsString()
  @IsOptional()
  gpuId?: string;

  @IsString()
  @IsOptional()
  psu_id?: string;

  @IsString()
  @IsOptional()
  psuId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  ram_cantidad?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  ramCantidad?: number;
}

