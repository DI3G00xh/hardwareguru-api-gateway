import { HttpService } from '@nestjs/axios';
import {
  GatewayTimeoutException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AxiosError } from 'axios';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import {
  TENANT_ID_HEADER,
  USER_ID_HEADER,
  USER_ROLE_HEADER,
} from './auth.constants';
import type { LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import type {
  AuthResponse,
  AuthUserSummary,
  IdentityHeaders,
} from './interfaces/auth.interface';

const DEFAULT_AUTH_SERVICE_URL = 'http://localhost:4000';
const DEFAULT_AUTH_TIMEOUT_MS = 5000;

@Injectable()
export class AuthService {
  private readonly authServiceUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const rawUrl =
      this.configService.get<string>('AUTH_SERVICE_URL') ||
      DEFAULT_AUTH_SERVICE_URL;
    this.authServiceUrl = rawUrl.replace(/\/+$/, '');

    const rawTimeout = Number(
      this.configService.get<string>('AUTH_TIMEOUT_MS'),
    );
    this.timeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout > 0
        ? rawTimeout
        : DEFAULT_AUTH_TIMEOUT_MS;
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    return this.forward<AuthResponse>('POST', '/api/auth/register', dto);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    return this.forward<AuthResponse>('POST', '/api/auth/login', dto);
  }

  async getMe(identity: IdentityHeaders): Promise<AuthUserSummary> {
    return this.forward<AuthUserSummary>(
      'GET',
      '/api/auth/me',
      undefined,
      identity,
    );
  }

  async updateProfile(
    dto: UpdateProfileDto,
    identity: IdentityHeaders,
  ): Promise<AuthResponse> {
    return this.forward<AuthResponse>(
      'PUT',
      '/api/auth/profile',
      dto,
      identity,
    );
  }

  private async forward<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    data?: unknown,
    identity?: IdentityHeaders,
  ): Promise<T> {
    const headers = this.buildForwardHeaders(identity);

    try {
      const response = await firstValueFrom(
        this.httpService
          .request<T>({
            method,
            url: `${this.authServiceUrl}${path}`,
            data,
            headers,
            timeout: this.timeoutMs,
          })
          .pipe(timeout(this.timeoutMs)),
      );

      return response.data;
    } catch (error) {
      this.handleHttpError(error);
    }
  }

  private buildForwardHeaders(
    identity?: IdentityHeaders,
  ): Record<string, string> | undefined {
    if (!identity) {
      return undefined;
    }

    const headers: Record<string, string> = {};
    if (identity.userId) {
      headers[USER_ID_HEADER] = identity.userId;
    }
    if (identity.role) {
      headers[USER_ROLE_HEADER] = identity.role;
    }
    if (identity.tenantId) {
      headers[TENANT_ID_HEADER] = identity.tenantId;
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  private handleHttpError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error instanceof TimeoutError) {
      throw new GatewayTimeoutException(
        'Timeout al esperar respuesta del servicio de autenticación',
      );
    }

    const axiosError = error as AxiosError<unknown>;
    if (
      axiosError?.code === 'ECONNABORTED' ||
      axiosError?.code === 'ETIMEDOUT'
    ) {
      throw new GatewayTimeoutException(
        'Timeout al esperar respuesta del servicio de autenticación',
      );
    }

    if (axiosError?.response) {
      throw new HttpException(
        (axiosError.response.data as string | Record<string, any>) ??
          'Error en el servicio de autenticación',
        axiosError.response.status,
      );
    }

    throw new ServiceUnavailableException('Auth service no disponible');
  }
}
