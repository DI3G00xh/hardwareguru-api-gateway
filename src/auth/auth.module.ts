import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GatewayAuthGuard } from './guards/gateway-auth.guard';
import { ApiKeyService } from './services/api-key.service';
import { TokenVerifierService } from './services/token-verifier.service';

const DEFAULT_AUTH_TIMEOUT_MS = 5000;

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const parsed = Number(configService.get<string>('AUTH_TIMEOUT_MS'));
        return {
          timeout:
            Number.isFinite(parsed) && parsed > 0
              ? parsed
              : DEFAULT_AUTH_TIMEOUT_MS,
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenVerifierService,
    ApiKeyService,
    GatewayAuthGuard,
  ],
  exports: [
    AuthService,
    TokenVerifierService,
    ApiKeyService,
    GatewayAuthGuard,
  ],
})
export class AuthModule {}
