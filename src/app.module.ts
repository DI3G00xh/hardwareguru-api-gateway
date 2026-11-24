import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { GatewayAuthGuard } from './auth/guards/gateway-auth.guard';
import { CatalogoModule } from './catalogo/catalogo.module';
import { SimuladorModule } from './simulador/simulador.module';
import { KafkaModule } from './kafka/kafka.module';
import { AlertsModule } from './alerts/alerts.module';
import { ChatModule } from './chat/chat.module';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'hardwareguru-api-gateway',
    }),
    AuthModule,
    CatalogoModule,
    SimuladorModule,
    KafkaModule,
    AlertsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: GatewayAuthGuard,
    },
  ],
})
export class AppModule {}
