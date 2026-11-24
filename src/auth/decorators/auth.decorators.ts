import { SetMetadata } from '@nestjs/common';
import {
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
  REQUIRE_API_KEY,
  ROLES_KEY,
  SCOPES_KEY,
} from '../auth.constants';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

export const RequireApiKey = () => SetMetadata(REQUIRE_API_KEY, true);
