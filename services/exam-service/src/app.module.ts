import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamsController } from './exams/exams.controller';
import { ExamsService } from './exams/exams.service';
import { MinioService } from './exams/minio.service';
import { ExamSchema } from './schemas/exam.schema';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? 'mongodb://localhost:27017/su-advisor',
    ),
    MongooseModule.forFeature([{ name: 'Exam', schema: ExamSchema }]),
  ],
  controllers: [ExamsController],
  providers: [ExamsService, MinioService],
})
export class AppModule {}
