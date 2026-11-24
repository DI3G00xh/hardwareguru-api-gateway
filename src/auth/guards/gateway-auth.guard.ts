import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  API_KEY_HEADER,
  IDENTITY_HEADERS,
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
  REQUIRE_API_KEY,
  ROLES_KEY,
  SCOPES_KEY,
  TENANT_ID_HEADER,
  USER_ID_HEADER,
  USER_ROLE_HEADER,
} from '../auth.constants';
import type {
  ApiKeyRecord,
  AuthenticatedUser,
  RequestWithAuth,
} from '../interfaces/auth.interface';
import { ApiKeyService } from '../services/api-key.service';
import { TokenVerifierService } from '../services/token-verifier.service';

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenVerifierService: TokenVerifierService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    this.sanitizeIdentityHeaders(request);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const requiredScopes =
      this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const routeRequiresApiKey = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_API_KEY,
      [context.getHandler(), context.getClass()],
    );

    const apiKeyRecord = this.inspectApiKey(
      request,
      Boolean(
        !isPublic &&
          (routeRequiresApiKey || this.apiKeyService.isRequiredByDefault()),
      ),
    );

    const bearerToken = this.extractBearerToken(request);
    if (bearerToken !== undefined) {
      const user = await this.tokenVerifierService.verify(bearerToken);
      if (apiKeyRecord?.tenantId && !user.tenantId) {
        user.tenantId = apiKeyRecord.tenantId;
      }
      this.assertPermissions(user, requiredRoles, requiredScopes);
      this.propagateIdentity(request, user);
      return true;
    }

    if (isPublic) {
      return true;
    }

    if (apiKeyRecord) {
      const apiKeyUser = this.mapApiKeyToUser(apiKeyRecord);
      this.assertPermissions(apiKeyUser, requiredRoles, requiredScopes);
      this.propagateIdentity(request, apiKeyUser);
      return true;
    }

    if (isOptionalAuth) {
      return true;
    }

    throw new UnauthorizedException('Token de autenticación requerido');
  }

  private sanitizeIdentityHeaders(request: RequestWithAuth): void {
    request.user = undefined;
    if (!request.headers) {
      request.headers = {};
      return;
    }
    for (const header of IDENTITY_HEADERS) {
      delete request.headers[header];
    }
  }

  private inspectApiKey(
    request: RequestWithAuth,
    required: boolean,
  ): ApiKeyRecord | undefined {
    const rawHeader = request.headers[API_KEY_HEADER];
    if (rawHeader === undefined) {
      if (required) {
        throw new UnauthorizedException('API Key requerida');
      }
      return undefined;
    }

    if (typeof rawHeader !== 'string' || !rawHeader.trim()) {
      throw new UnauthorizedException('API Key inválida');
    }

    return this.apiKeyService.validateApiKey(rawHeader);
  }

  private extractBearerToken(request: RequestWithAuth): string | undefined {
    const rawAuth = request.headers['authorization'];
    if (rawAuth === undefined) {
      return undefined;
    }

    if (typeof rawAuth !== 'string') {
      throw new UnauthorizedException('Token de autenticación inválido');
    }

    const match = /^Bearer\s+(.+)$/i.exec(rawAuth.trim());
    if (!match || !match[1]?.trim()) {
      throw new UnauthorizedException('Formato de Authorization Bearer inválido');
    }

    return match[1].trim();
  }

  private mapApiKeyToUser(record: ApiKeyRecord): AuthenticatedUser {
    const role = record.role ?? 'service';
    const roles = record.roles?.length ? record.roles : [role];
    return {
      id: record.userId ?? '',
      role,
      roles,
      scopes: record.scopes ?? [],
      tenantId: record.tenantId,
      authType: 'api-key',
      apiKeyName: record.name,
    };
  }

  private assertPermissions(
    user: AuthenticatedUser,
    requiredRoles: string[],
    requiredScopes: string[],
  ): void {
    if (requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((role) => user.roles.includes(role));
      if (!hasRole) {
        throw new ForbiddenException('Rol insuficiente para acceder al recurso');
      }
    }

    if (requiredScopes.length > 0) {
      const hasAllScopes = requiredScopes.every((scope) =>
        user.scopes.includes(scope),
      );
      if (!hasAllScopes) {
        throw new ForbiddenException(
          'Permisos (scopes) insuficientes para acceder al recurso',
        );
      }
    }
  }

  private propagateIdentity(
    request: RequestWithAuth,
    user: AuthenticatedUser,
  ): void {
    request.user = user;
    if (user.id) {
      request.headers[USER_ID_HEADER] = user.id;
    }
    if (user.role) {
      request.headers[USER_ROLE_HEADER] = user.role;
    }
    if (user.tenantId) {
      request.headers[TENANT_ID_HEADER] = user.tenantId;
    }
  }
}
