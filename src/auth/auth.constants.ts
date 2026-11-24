export const IS_PUBLIC_KEY = 'auth:isPublic';
export const IS_OPTIONAL_AUTH_KEY = 'auth:isOptionalAuth';
export const ROLES_KEY = 'auth:roles';
export const SCOPES_KEY = 'auth:scopes';
export const REQUIRE_API_KEY = 'auth:requireApiKey';

export const API_KEY_HEADER = 'x-api-key';
export const USER_ID_HEADER = 'x-user-id';
export const USER_ROLE_HEADER = 'x-user-role';
export const TENANT_ID_HEADER = 'x-tenant-id';

export const IDENTITY_HEADERS = [
  USER_ID_HEADER,
  USER_ROLE_HEADER,
  TENANT_ID_HEADER,
] as const;
