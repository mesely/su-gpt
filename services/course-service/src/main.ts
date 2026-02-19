import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = parseInt(process.env.COURSE_SERVICE_PORT ?? '50051', 10);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'course',
      protoPath: join(__dirname, '../proto/course.proto'),
      url: `0.0.0.0:${port}`,
    },
  });

  await app.listen();
  console.log(`CourseService gRPC sunucusu ${port} portunda dinliyor.`);
}

bootstrap().catch((err) => {
  console.error('CourseService başlatılamadı:', err);
  process.exit(1);
});
