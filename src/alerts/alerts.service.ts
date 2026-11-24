import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AxiosError } from 'axios';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import type { AlertResponse } from './interfaces/alerts.interface';

const DEFAULT_ALERTS_SERVICE_URL = 'http://localhost:5001';
const DEFAULT_ALERTS_TIMEOUT_MS = 5000;
const GUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AlertsService {
  private readonly alertsServiceUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const rawUrl =
      this.configService.get<string>('ALERTS_SERVICE_URL') ||
      DEFAULT_ALERTS_SERVICE_URL;
    this.alertsServiceUrl = rawUrl.replace(/\/+$/, '');

    const rawTimeout = Number(
      this.configService.get<string>('ALERTS_TIMEOUT_MS'),
    );
    this.timeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout > 0
        ? rawTimeout
        : DEFAULT_ALERTS_TIMEOUT_MS;
  }

  async listAlerts(userId?: string): Promise<AlertResponse[]> {
    const resolvedUserId = this.requireUserId(userId);

    try {
      const response = await firstValueFrom(
        this.httpService
          .get<AlertResponse[]>(`${this.alertsServiceUrl}/alerts`, {
            params: { userId: resolvedUserId },
            timeout: this.timeoutMs,
          })
          .pipe(timeout(this.timeoutMs)),
      );

      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      this.handleHttpError(error);
    }
  }

  async markAsRead(id: string, userId?: string): Promise<AlertResponse> {
    const resolvedUserId = this.requireUserId(userId);
    const normalizedId = id?.trim() ?? '';

    if (!GUID_REGEX.test(normalizedId)) {
      throw new BadRequestException(
        'El identificador de la alerta debe ser un UUID válido',
      );
    }

    // alerts-service PATCH /alerts/{id}/read aún no filtra por userId,
    // por lo que el gateway valida la pertenencia antes de reenviar.
    const userAlerts = await this.listAlerts(resolvedUserId);
    const ownsAlert = userAlerts.some(
      (alert) =>
        typeof alert?.id === 'string' &&
        alert.id.toLowerCase() === normalizedId.toLowerCase(),
    );

    if (!ownsAlert) {
      throw new NotFoundException({
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.5',
        title: 'Alerta no encontrada',
        status: 404,
        detail: `No existe una alerta con id ${normalizedId}.`,
      });
    }

    try {
      const response = await firstValueFrom(
        this.httpService
          .patch<AlertResponse>(
            `${this.alertsServiceUrl}/alerts/${encodeURIComponent(normalizedId)}/read`,
            undefined,
            {
              timeout: this.timeoutMs,
            },
          )
          .pipe(timeout(this.timeoutMs)),
      );

      return response.data;
    } catch (error) {
      this.handleHttpError(error);
    }
  }

  private requireUserId(userId?: string): string {
    const resolved = userId?.trim();
    if (!resolved) {
      throw new UnauthorizedException('Token de usuario requerido');
    }
    return resolved;
  }

  private handleHttpError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error instanceof TimeoutError) {
      throw new GatewayTimeoutException(
        'Timeout al esperar respuesta del servicio de alertas',
      );
    }

    const axiosError = error as AxiosError<unknown>;
    if (
      axiosError?.code === 'ECONNABORTED' ||
      axiosError?.code === 'ETIMEDOUT'
    ) {
      throw new GatewayTimeoutException(
        'Timeout al esperar respuesta del servicio de alertas',
      );
    }

    if (axiosError?.response) {
      throw new HttpException(
        (axiosError.response.data as string | Record<string, any>) ??
          'Error en el servicio de alertas',
        axiosError.response.status,
      );
    }

    throw new ServiceUnavailableException('Servicio de alertas no disponible');
  }
}
