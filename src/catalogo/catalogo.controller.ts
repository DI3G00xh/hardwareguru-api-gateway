import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { CatalogoService } from './catalogo.service';
import type { BuildRequest } from './interfaces/catalogo.interface';

@Controller('componentes')
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  @Get()
  async listar(@Query('tipo') tipo?: string) {
    return this.catalogoService.listarComponentes(tipo);
  }

  @Get(':id')
  async obtenerDetalle(@Param('id') id: string) {
    return this.catalogoService.obtenerSpecs(id);
  }

  @Post('compatibilidad')
  async verificarCompatibilidad(@Body() build: BuildRequest) {
    return this.catalogoService.verificarCompatibilidad(build);
  }
}

@Controller('compatibilidad')
export class CompatibilidadController {
  constructor(private readonly catalogoService: CatalogoService) {}

  @Post()
  async verificarCompatibilidad(@Body() build: BuildRequest) {
    return this.catalogoService.verificarCompatibilidad(build);
  }
}
