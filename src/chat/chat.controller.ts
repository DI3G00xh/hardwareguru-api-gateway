import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ChatDto } from './dto/chat.dto';
import { ChatService } from './chat.service';

interface RequestWithUser {
  user?: {
    id?: string;
    sub?: string;
    role?: string;
    tenantId?: string;
  };
  headers?: Record<string, string | string[] | undefined>;
}

function resolveUserId(dto: ChatDto, req?: RequestWithUser): string | undefined {
  const authUserId = req?.user?.id ?? req?.user?.sub;
  if (authUserId) {
    return String(authUserId);
  }

  const headerUserId = req?.headers?.['x-user-id'];
  if (typeof headerUserId === 'string' && headerUserId.trim()) {
    return headerUserId.trim();
  }

  if (dto.userId?.trim()) {
    return dto.userId.trim();
  }

  return undefined;
}

function resolveIdentityMetadata(
  req?: RequestWithUser,
): { role?: string; tenantId?: string } | undefined {
  const headerRole = req?.headers?.['x-user-role'];
  const role =
    req?.user?.role ??
    (typeof headerRole === 'string' && headerRole.trim()
      ? headerRole.trim()
      : undefined);

  const headerTenant = req?.headers?.['x-tenant-id'];
  const tenantId =
    req?.user?.tenantId ??
    (typeof headerTenant === 'string' && headerTenant.trim()
      ? headerTenant.trim()
      : undefined);

  if (!role && !tenantId) {
    return undefined;
  }

  return {
    ...(role ? { role } : {}),
    ...(tenantId ? { tenantId } : {}),
  };
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @Post()
  @HttpCode(HttpStatus.OK)
  async enviarMensaje(@Body() dto: ChatDto, @Req() req?: RequestWithUser) {
    const userId = resolveUserId(dto, req);
    const identity = resolveIdentityMetadata(req);
    return identity
      ? this.chatService.enviarMensaje(dto, userId, identity)
      : this.chatService.enviarMensaje(dto, userId);
  }
}
