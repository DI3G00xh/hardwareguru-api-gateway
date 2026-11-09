import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { existsSync } from 'fs';
import { join } from 'path';
import { CatalogoController, CompatibilidadController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';

const getProtoPath = () => {
  const localProto = join(__dirname, 'proto/hardware.proto');
  if (existsSync(localProto)) {
    return localProto;
  }
  return join(__dirname, '../common/proto/hardware.proto');
};

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'CATALOGO_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'hardware',
          protoPath: getProtoPath(),
          url: process.env.CATALOGO_GRPC_URL || 'localhost:50051',
        },
      },
    ]),
  ],
  controllers: [CatalogoController, CompatibilidadController],
  providers: [CatalogoService],
  exports: [CatalogoService],
})
export class CatalogoModule {}
