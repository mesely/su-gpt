import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = parseInt(process.env.GATEWAY_PORT ?? '3000', 10);

  // Güvenlik başlıkları
  app.use(helmet());

  // CORS — frontend'e izin ver
  app.enableCors({
    origin: [
      'http://localhost:3001',
      process.env.FRONTEND_URL ?? 'http://localhost:3001',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  await app.listen(port);
  console.log(`Gateway HTTP sunucusu http://0.0.0.0:${port} adresinde çalışıyor.`);
}

bootstrap().catch((err) => {
  console.error('Gateway başlatılamadı:', err);
  process.exit(1);
});
