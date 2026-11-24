import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { OptionalAuth } from '../auth/decorators/auth.decorators';
import { CatalogoService } from './catalogo.service';
import { BuildDto } from './dto/build.dto';

@OptionalAuth()
@Controller('componentes')
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) { }

  @Get()
  async listar(@Query('tipo') tipo?: string) {
    return this.catalogoService.listarComponentes(tipo);
  }

  @Get(':id')
  async obtenerDetalle(@Param('id') id: string) {
    return this.catalogoService.obtenerSpecs(id);
  }

  @Post('compatibilidad')
  async verificarCompatibilidad(@Body() build: BuildDto) {
    return this.catalogoService.verificarCompatibilidad(build as any);
  }
}

@OptionalAuth()
@Controller('compatibilidad')
export class CompatibilidadController {
  constructor(private readonly catalogoService: CatalogoService) { }

  @Post()
  async verificarCompatibilidad(@Body() build: BuildDto) {
    return this.catalogoService.verificarCompatibilidad(build as any);
  }
}
