import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { existsSync } from 'fs';
import { join } from 'path';
import { CatalogoController, CompatibilidadController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';

const getProtoPath = () => {
  const baseDir =
    typeof __dirname !== 'undefined'
      ? __dirname
      : join(process.cwd(), 'src/catalogo');

  const localProto = join(baseDir, 'proto/hardware.proto');
  if (existsSync(localProto)) {
    return localProto;
  }
  return join(baseDir, '../common/proto/hardware.proto');
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
          loader: {
            keepCase: true,
          },
        },
      },
    ]),
  ],
  controllers: [CatalogoController, CompatibilidadController],
  providers: [CatalogoService],
  exports: [CatalogoService],
})
export class CatalogoModule { }
