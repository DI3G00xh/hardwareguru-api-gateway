import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

const DEFAULT_MCP_TIMEOUT_MS = 45000;

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const parsed = Number(configService.get<string>('MCP_TIMEOUT_MS'));
        return {
          timeout:
            Number.isFinite(parsed) && parsed > 0
              ? parsed
              : DEFAULT_MCP_TIMEOUT_MS,
        };
      },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
