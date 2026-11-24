import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

const DEFAULT_ALERTS_TIMEOUT_MS = 5000;

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const parsed = Number(configService.get<string>('ALERTS_TIMEOUT_MS'));
        return {
          timeout:
            Number.isFinite(parsed) && parsed > 0
              ? parsed
              : DEFAULT_ALERTS_TIMEOUT_MS,
        };
      },
    }),
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
