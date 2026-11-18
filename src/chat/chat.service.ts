import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AxiosError } from 'axios';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import type { ChatDto } from './dto/chat.dto';
import type { McpChatResponse } from './interfaces/chat.interface';

const DEFAULT_MCP_SERVICE_URL = 'http://localhost:3001';
const DEFAULT_MCP_TIMEOUT_MS = 45000;

@Injectable()
export class ChatService {
  private readonly mcpServiceUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const rawUrl =
      this.configService.get<string>('MCP_SERVICE_URL') ||
      DEFAULT_MCP_SERVICE_URL;
    this.mcpServiceUrl = rawUrl.replace(/\/+$/, '');

    const rawTimeout = Number(this.configService.get<string>('MCP_TIMEOUT_MS'));
    this.timeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout > 0
        ? rawTimeout
        : DEFAULT_MCP_TIMEOUT_MS;
  }

  async enviarMensaje(
    dto: ChatDto,
    userId?: string,
  ): Promise<McpChatResponse> {
    const resolvedUserId = userId?.trim();
    if (!resolvedUserId) {
      throw new UnauthorizedException(
        'No autorizado. Falta el header x-user-id',
      );
    }

    const prompt = this.buildPrompt(dto);
    if (!prompt) {
      throw new BadRequestException('El prompt es requerido');
    }

    try {
      const response = await firstValueFrom(
        this.httpService
          .post<McpChatResponse>(
            `${this.mcpServiceUrl}/chat`,
            { prompt },
            {
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': resolvedUserId,
              },
              timeout: this.timeoutMs,
            },
          )
          .pipe(timeout(this.timeoutMs)),
      );

      return {
        respuesta: response.data?.respuesta ?? '',
      };
    } catch (error) {
      this.handleHttpError(error);
    }
  }

  private buildPrompt(dto: ChatDto): string {
    if (dto.prompt !== undefined) {
      return dto.prompt.trim();
    }

    const mensaje = dto.mensaje?.trim() ?? '';
    if (!mensaje) {
      return '';
    }

    const historial = Array.isArray(dto.historial) ? dto.historial : [];
    const historialLineas = historial
      .slice(-6)
      .map((item) => {
        const rol = typeof item.rol === 'string' ? item.rol : 'usuario';
        const texto = typeof item.texto === 'string' ? item.texto.trim() : '';
        return texto ? `${rol}: ${texto}` : '';
      })
      .filter(Boolean);

    if (historialLineas.length === 0) {
      return mensaje;
    }

    return `[Historial reciente]\n${historialLineas.join('\n')}\n\n[Consulta actual]\n${mensaje}`;
  }

  private handleHttpError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error instanceof TimeoutError) {
      throw new GatewayTimeoutException(
        'Timeout al esperar respuesta del servicio de IA',
      );
    }

    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    if (
      axiosError?.code === 'ECONNABORTED' ||
      axiosError?.code === 'ETIMEDOUT'
    ) {
      throw new GatewayTimeoutException(
        'Timeout al esperar respuesta del servicio de IA',
      );
    }

    if (!axiosError?.response) {
      throw new BadGatewayException(
        'No se pudo comunicar con el servicio de IA',
      );
    }

    const status = axiosError.response.status;
    const data = axiosError.response.data;
    const detail =
      data?.error || data?.message || 'Error en el servicio de IA';

    switch (status) {
      case 400:
        throw new BadRequestException(detail);
      case 401:
        throw new UnauthorizedException(detail);
      case 403:
        throw new ForbiddenException(detail);
      case 404:
        throw new NotFoundException(detail);
      case 504:
        throw new GatewayTimeoutException(detail);
      default:
        throw new BadGatewayException(detail);
    }
  }
}
