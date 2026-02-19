import {
  Body,
  Controller,
  Inject,
  OnModuleInit,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { EXAM_CLIENT } from '../proxy/grpc-clients.module';

interface ExamUploadClient {
  uploadExam(data: {
    course_code: string;
    year: number;
    semester: string;
    type: string;
    file_name: string;
    uploaded_by: string;
  }): Observable<unknown>;
}

@Controller('api/v1/admin/exams')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminExamController implements OnModuleInit {
  private svc!: ExamUploadClient;

  constructor(@Inject(EXAM_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<ExamUploadClient>('ExamService');
  }

  @Post()
  uploadExam(
    @Body()
    body: {
      courseCode: string;
      year: number;
      semester: string;
      type: string;
      fileName: string;
      uploadedBy: string;
    },
  ) {
    return firstValueFrom(
      this.svc.uploadExam({
        course_code: body.courseCode,
        year: body.year,
        semester: body.semester,
        type: body.type,
        file_name: body.fileName,
        uploaded_by: body.uploadedBy,
      }),
    );
  }
}
