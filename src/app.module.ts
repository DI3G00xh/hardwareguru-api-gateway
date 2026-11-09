import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
    CatalogoModule,
    SimuladorModule,
    KafkaModule,
    AlertsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
