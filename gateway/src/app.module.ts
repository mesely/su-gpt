import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';

import { GrpcClientsModule } from './proxy/grpc-clients.module';
import { JwtStrategy } from './auth/jwt.strategy';
import { MockSsoController } from './auth/mock-sso.controller';

import { CoursesController } from './courses/courses.controller';
import { SelectionsController } from './courses/selections.controller';
import { RagController } from './rag/rag.controller';
import { InstructorController } from './instructor/instructor.controller';
import { AdminWhatsappController } from './instructor/admin-whatsapp.controller';
import { ExamController } from './exam/exam.controller';
import { AdminExamController } from './exam/admin-exam.controller';

@Module({
  imports: [
    // Rate limiting: her IP için 60 istek / dakika
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),

    PassportModule,

    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change_me_in_production',
      signOptions: { expiresIn: '7d' },
    }),

    GrpcClientsModule,
  ],
  controllers: [
    MockSsoController,
    CoursesController,
    SelectionsController,
    RagController,
    InstructorController,
    AdminWhatsappController,
    ExamController,
    AdminExamController,
  ],
  providers: [JwtStrategy],
})
export class AppModule {}
