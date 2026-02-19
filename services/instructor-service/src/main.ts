import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = parseInt(process.env.INSTRUCTOR_SERVICE_PORT ?? '50053', 10);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'instructor',
      protoPath: join(__dirname, '../proto/instructor.proto'),
      url: `0.0.0.0:${port}`,
    },
  });

  await app.listen();
  console.log(`InstructorService gRPC sunucusu ${port} portunda dinliyor.`);
}

bootstrap().catch((err) => {
  console.error('InstructorService başlatılamadı:', err);
  process.exit(1);
});
