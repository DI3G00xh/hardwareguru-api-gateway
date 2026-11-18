import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { existsSync } from 'fs';
import { join } from 'path';
import { CatalogoModule } from '../catalogo/catalogo.module';
import {
  SimulacionesController,
  SimuladorController,
  SimularController,
} from './simulador.controller';
import { SimuladorService } from './simulador.service';

const getProtoPath = () => {
  const baseDir =
    typeof __dirname !== 'undefined'
      ? __dirname
      : join(process.cwd(), 'src/simulador');

  const localProto = join(baseDir, 'proto/simulator.proto');
  if (existsSync(localProto)) {
    return localProto;
  }
  return join(baseDir, '../common/proto/simulator.proto');
};

@Module({
  imports: [
    CatalogoModule,
    ClientsModule.registerAsync([
      {
        name: 'SIMULATOR_PACKAGE',
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'simulator',
            protoPath: getProtoPath(),
            url:
              configService.get<string>('SIMULADOR_GRPC_URL') ||
              configService.get<string>('SIMULATOR_GRPC_URL') ||
              'localhost:9090',
            loader: {
              keepCase: true,
            },
          },
        }),
      },
    ]),
  ],
  controllers: [SimuladorController, SimulacionesController, SimularController],
  providers: [SimuladorService],
  exports: [SimuladorService],
})
export class SimuladorModule {}
