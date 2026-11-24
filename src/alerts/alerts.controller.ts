import {
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { USER_ID_HEADER } from '../auth/auth.constants';
import type { RequestWithAuth } from '../auth/interfaces/auth.interface';
import { AlertsService } from './alerts.service';

function extractUserId(req?: RequestWithAuth): string {
  const candidates = [
    req?.user?.id,
    req?.user?.sub,
    req?.headers?.[USER_ID_HEADER],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  throw new UnauthorizedException('Token de usuario requerido');
}

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) { }

  @Get()
  async listAlerts(@Req() req?: RequestWithAuth) {
    return this.alertsService.listAlerts(extractUserId(req));
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req?: RequestWithAuth) {
    return this.alertsService.markAsRead(id, extractUserId(req));
  }
}
