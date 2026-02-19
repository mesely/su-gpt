import {
  Controller,
  Get,
  Inject,
  OnModuleInit,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EXAM_CLIENT } from '../proxy/grpc-clients.module';

interface ExamServiceClient {
  getExams(data: {
    course_code: string;
    year: number;
    semester: string;
    type: string;
  }): Observable<unknown>;
  getPresignedUrl(data: { exam_id: string }): Observable<unknown>;
}

@Controller('api/v1/exams')
@UseGuards(JwtAuthGuard)
export class ExamController implements OnModuleInit {
  private svc!: ExamServiceClient;

  constructor(@Inject(EXAM_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<ExamServiceClient>('ExamService');
  }

  @Get()
  getExams(
    @Query('courseCode') courseCode = '',
    @Query('year') year = '0',
    @Query('semester') semester = '',
    @Query('type') type = '',
  ) {
    return firstValueFrom(
      this.svc.getExams({
        course_code: courseCode,
        year: parseInt(year, 10),
        semester,
        type,
      }),
    );
  }

  @Get(':id/url')
  getPresignedUrl(@Param('id') id: string) {
    return firstValueFrom(this.svc.getPresignedUrl({ exam_id: id }));
  }
}
