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
import { INSTRUCTOR_CLIENT } from '../proxy/grpc-clients.module';

interface InstructorServiceClient {
  getInstructorSummary(data: {
    instructor_name: string;
    course_code: string;
  }): Observable<unknown>;
  listInstructors(data: { page: number; page_size: number }): Observable<unknown>;
}

@Controller('api/v1/instructors')
@UseGuards(JwtAuthGuard)
export class InstructorController implements OnModuleInit {
  private svc!: InstructorServiceClient;

  constructor(@Inject(INSTRUCTOR_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<InstructorServiceClient>('InstructorService');
  }

  @Get()
  listInstructors(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return firstValueFrom(
      this.svc.listInstructors({
        page: parseInt(page, 10),
        page_size: parseInt(pageSize, 10),
      }),
    );
  }

  @Get(':name')
  getInstructorSummary(
    @Param('name') name: string,
    @Query('courseCode') courseCode = '',
  ) {
    return firstValueFrom(
      this.svc.getInstructorSummary({
        instructor_name: decodeURIComponent(name),
        course_code: courseCode,
      }),
    );
  }
}
