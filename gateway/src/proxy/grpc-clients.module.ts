import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

export const COURSE_CLIENT = 'COURSE_CLIENT';
export const RAG_CLIENT = 'RAG_CLIENT';
export const INSTRUCTOR_CLIENT = 'INSTRUCTOR_CLIENT';
export const EXAM_CLIENT = 'EXAM_CLIENT';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: COURSE_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'course',
          protoPath: join(__dirname, '../../proto/course.proto'),
          url: `${process.env.COURSE_SERVICE_HOST ?? 'localhost'}:${process.env.COURSE_SERVICE_PORT ?? '50051'}`,
        },
      },
      {
        name: RAG_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'rag',
          protoPath: join(__dirname, '../../proto/rag.proto'),
          url: `${process.env.RAG_SERVICE_HOST ?? 'localhost'}:${process.env.RAG_SERVICE_PORT ?? '50052'}`,
        },
      },
      {
        name: INSTRUCTOR_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'instructor',
          protoPath: join(__dirname, '../../proto/instructor.proto'),
          url: `${process.env.INSTRUCTOR_SERVICE_HOST ?? 'localhost'}:${process.env.INSTRUCTOR_SERVICE_PORT ?? '50053'}`,
        },
      },
      {
        name: EXAM_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'exam',
          protoPath: join(__dirname, '../../proto/exam.proto'),
          url: `${process.env.EXAM_SERVICE_HOST ?? 'localhost'}:${process.env.EXAM_SERVICE_PORT ?? '50054'}`,
        },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class GrpcClientsModule {}
