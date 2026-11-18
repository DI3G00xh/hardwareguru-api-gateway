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

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @Post()
  @HttpCode(HttpStatus.OK)
  async enviarMensaje(@Body() dto: ChatDto, @Req() req?: RequestWithUser) {
    return this.chatService.enviarMensaje(dto, resolveUserId(dto, req));
  }
}
