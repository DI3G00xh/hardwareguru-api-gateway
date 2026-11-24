import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  TENANT_ID_HEADER,
  USER_ID_HEADER,
  USER_ROLE_HEADER,
} from './auth.constants';
import { AuthService } from './auth.service';
import { Public } from './decorators/auth.decorators';
import { LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import type {
  IdentityHeaders,
  RequestWithAuth,
} from './interfaces/auth.interface';

function extractIdentityHeaders(req?: RequestWithAuth): IdentityHeaders {
  const headerUserId = req?.headers?.[USER_ID_HEADER];
  const userId =
    req?.user?.id ||
    (typeof headerUserId === 'string' && headerUserId.trim()
      ? headerUserId.trim()
      : undefined);

  if (!userId) {
    throw new UnauthorizedException('Token de usuario requerido');
  }

  const headerRole = req?.headers?.[USER_ROLE_HEADER];
  const role =
    req?.user?.role ||
    (typeof headerRole === 'string' && headerRole.trim()
      ? headerRole.trim()
      : undefined);

  const headerTenant = req?.headers?.[TENANT_ID_HEADER];
  const tenantId =
    req?.user?.tenantId ||
    (typeof headerTenant === 'string' && headerTenant.trim()
      ? headerTenant.trim()
      : undefined);

  return {
    userId: String(userId),
    ...(role ? { role } : {}),
    ...(tenantId ? { tenantId } : {}),
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  async getMe(@Req() req?: RequestWithAuth) {
    return this.authService.getMe(extractIdentityHeaders(req));
  }

  @Put('profile')
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @Req() req?: RequestWithAuth,
  ) {
    return this.authService.updateProfile(dto, extractIdentityHeaders(req));
  }
}
