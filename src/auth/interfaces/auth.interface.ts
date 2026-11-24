export interface AuthenticatedUser {
  id: string;
  sub?: string;
  email?: string;
  role: string;
  roles: string[];
  scopes: string[];
  tenantId?: string;
  authType: 'jwt' | 'api-key';
  apiKeyName?: string;
}

export interface IdentityHeaders {
  userId?: string;
  role?: string;
  tenantId?: string;
}

export interface RequestWithAuth {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
}

export interface ApiKeyRecord {
  key: string;
  name: string;
  active: boolean;
  role?: string;
  roles?: string[];
  scopes?: string[];
  tenantId?: string;
  userId?: string;
}

export interface AuthUserSummary {
  id: number | string;
  nombre: string;
  email: string;
}

export interface AuthResponse {
  mensaje: string;
  token?: string;
  user?: AuthUserSummary;
  usuario?: AuthUserSummary;
}
