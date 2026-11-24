import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { OptionalAuth } from '../auth/decorators/auth.decorators';
import { GuardarBuildDto, SimularDto } from './dto/simular.dto';
import { SimuladorService } from './simulador.service';

interface RequestWithUser {
  user?: {
    id?: string;
    sub?: string;
  };
  headers?: Record<string, string | string[] | undefined>;
}

function extractAuthenticatedUserId(req?: RequestWithUser): string | undefined {
  const userId = req?.user?.id ?? req?.user?.sub;
  if (userId) {
    return String(userId);
  }
  const headerUserId = req?.headers?.['x-user-id'];
  if (typeof headerUserId === 'string' && headerUserId.trim()) {
    return headerUserId.trim();
  }
  return undefined;
}

@Controller('simulador')
export class SimuladorController {
  constructor(private readonly simuladorService: SimuladorService) {}

  @OptionalAuth()
  @Post('calcular')
  @HttpCode(HttpStatus.OK)
  async calcular(@Body() dto: SimularDto, @Req() req?: RequestWithUser) {
    return this.simuladorService.simular(dto, extractAuthenticatedUserId(req));
  }

  @OptionalAuth()
  @Post()
  @HttpCode(HttpStatus.OK)
  async simular(@Body() dto: SimularDto, @Req() req?: RequestWithUser) {
    return this.simuladorService.simular(dto, extractAuthenticatedUserId(req));
  }

  @Post('builds')
  async guardarBuild(
    @Body() dto: GuardarBuildDto,
    @Req() req?: RequestWithUser,
  ) {
    return this.simuladorService.guardarBuild(
      dto,
      extractAuthenticatedUserId(req),
    );
  }

  @Get('builds')
  async listarBuilds(@Req() req?: RequestWithUser) {
    return this.simuladorService.listarBuilds(extractAuthenticatedUserId(req));
  }

  @Delete('builds/:id')
  async eliminarBuild(@Param('id') id: string, @Req() req?: RequestWithUser) {
    return this.simuladorService.eliminarBuild(
      id,
      extractAuthenticatedUserId(req),
    );
  }
}

@OptionalAuth()
@Controller('simulaciones')
export class SimulacionesController {
  constructor(private readonly simuladorService: SimuladorService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async crearSimulacion(@Body() dto: SimularDto, @Req() req?: RequestWithUser) {
    return this.simuladorService.simular(dto, extractAuthenticatedUserId(req));
  }
}

@OptionalAuth()
@Controller('simular')
export class SimularController {
  constructor(private readonly simuladorService: SimuladorService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async simularFrontend(
    @Body() dto: SimularDto,
    @Req() req?: RequestWithUser,
  ) {
    return this.simuladorService.simularParaFrontend(
      dto,
      extractAuthenticatedUserId(req),
    );
  }
}

@Controller('builds')
export class BuildsController {
  constructor(private readonly simuladorService: SimuladorService) {}

  @Post()
  async guardarBuildFrontend(
    @Body() dto: GuardarBuildDto,
    @Req() req?: RequestWithUser,
  ) {
    return this.simuladorService.guardarBuildParaFrontend(
      dto,
      extractAuthenticatedUserId(req),
    );
  }

  @Get()
  async listarBuildsFrontend(@Req() req?: RequestWithUser) {
    return this.simuladorService.listarBuildsParaFrontend(
      extractAuthenticatedUserId(req),
    );
  }

  @Delete(':id')
  async eliminarBuildFrontend(
    @Param('id') id: string,
    @Req() req?: RequestWithUser,
  ) {
    return this.simuladorService.eliminarBuild(
      id,
      extractAuthenticatedUserId(req),
    );
  }
}
