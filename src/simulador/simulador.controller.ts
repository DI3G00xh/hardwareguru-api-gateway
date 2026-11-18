import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
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

  @Post('calcular')
  @HttpCode(HttpStatus.OK)
  async calcular(@Body() dto: SimularDto, @Req() req?: RequestWithUser) {
    return this.simuladorService.simular(dto, extractAuthenticatedUserId(req));
  }

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
}

@Controller('simulaciones')
export class SimulacionesController {
  constructor(private readonly simuladorService: SimuladorService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async crearSimulacion(@Body() dto: SimularDto, @Req() req?: RequestWithUser) {
    return this.simuladorService.simular(dto, extractAuthenticatedUserId(req));
  }
}

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
