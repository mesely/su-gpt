import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = parseInt(process.env.RAG_SERVICE_PORT ?? '50052', 10);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'rag',
      protoPath: join(__dirname, '../../proto/rag.proto'),
      url: `0.0.0.0:${port}`,
    },
  });

  await app.listen();
  console.log(`RagService gRPC sunucusu ${port} portunda dinliyor.`);
}

bootstrap().catch((err) => {
  console.error('RagService başlatılamadı:', err);
  process.exit(1);
});
