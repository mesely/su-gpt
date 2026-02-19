import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = parseInt(process.env.EXAM_SERVICE_PORT ?? '50054', 10);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package:   'exam',
      protoPath: join(__dirname, '../../proto/exam.proto'),
      url:       `0.0.0.0:${port}`,
    },
  });

  await app.listen();
  console.log(`ExamService gRPC sunucusu ${port} portunda dinliyor.`);
}

bootstrap().catch((err) => {
  console.error('ExamService başlatılamadı:', err);
  process.exit(1);
});
