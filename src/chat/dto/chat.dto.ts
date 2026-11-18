import { IsArray, IsOptional, IsString } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsOptional()
  prompt?: string;

  @IsString()
  @IsOptional()
  mensaje?: string;

  @IsArray()
  @IsOptional()
  historial?: Record<string, unknown>[];

  @IsString()
  @IsOptional()
  userId?: string;
}
