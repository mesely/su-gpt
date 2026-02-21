import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Inject,
  OnModuleInit,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { COURSE_CLIENT } from '../proxy/grpc-clients.module';
import { JwtPayload } from '../auth/jwt.strategy';

interface CourseServiceClient {
  getCourse(data: { code: string }): Observable<unknown>;
  searchCourses(data: {
    query: string;
    major: string;
    faculty: string;
    el_type: string;
    page: number;
    page_size: number;
  }): Observable<unknown>;
  getGraduationStatus(data: {
    student_id: string;
    studentId?: string;
    major: string;
    completed_courses: string[];
    completedCourses?: string[];
    current_semester: number;
    currentSemester?: number;
  }): Observable<unknown>;
  getSemesterPlan(data: {
    student_id: string;
    studentId?: string;
    major: string;
    completed_courses: string[];
    completedCourses?: string[];
    target_semester: number;
    targetSemester?: number;
    max_ects: number;
    maxEcts?: number;
  }): Observable<unknown>;
  getPathRecommendation(data: {
    student_id: string;
    studentId?: string;
    major: string;
    completed_courses: string[];
    completedCourses?: string[];
  }): Observable<unknown>;
}

@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class CoursesController implements OnModuleInit {
  private svc!: CourseServiceClient;

  constructor(@Inject(COURSE_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<CourseServiceClient>('CourseService');
  }

  @Get('courses')
  searchCourses(
    @Query('q') query = '',
    @Query('major') major = '',
    @Query('faculty') faculty = '',
    @Query('elType') elType = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return firstValueFrom(
      this.svc.searchCourses({
        query,
        major,
        faculty,
        el_type: elType,
        page: parseInt(page, 10),
        page_size: parseInt(pageSize, 10),
      }),
    );
  }

  @Get('courses/:code')
  getCourse(@Param('code') code: string) {
    return firstValueFrom(this.svc.getCourse({ code }));
  }

  @Get('graduation/:studentId')
  getGraduationStatus(
    @Param('studentId') studentId: string,
    @Query('major') major = '',
    @Query('completed') completed = '',
    @Query('semester') semester = '1',
    @Req() req: { user: JwtPayload },
  ) {
    const completedCourses = completed ? completed.split(',') : [];
    return firstValueFrom(
      this.svc.getGraduationStatus({
        student_id: studentId,
        studentId,
        major: major || req.user.major,
        completed_courses: completedCourses,
        completedCourses,
        current_semester: parseInt(semester, 10),
        currentSemester: parseInt(semester, 10),
      }),
    );
  }

  @Get('plan/:studentId')
  getSemesterPlan(
    @Param('studentId') studentId: string,
    @Query('major') major = '',
    @Query('completed') completed = '',
    @Query('targetSemester') targetSemester = '1',
    @Query('maxEcts') maxEcts = '30',
    @Req() req: { user: JwtPayload },
  ) {
    const completedCourses = completed ? completed.split(',') : [];
    return firstValueFrom(
      this.svc.getSemesterPlan({
        student_id: studentId,
        studentId,
        major: major || req.user.major,
        completed_courses: completedCourses,
        completedCourses,
        target_semester: parseInt(targetSemester, 10),
        targetSemester: parseInt(targetSemester, 10),
        max_ects: parseInt(maxEcts, 10),
        maxEcts: parseInt(maxEcts, 10),
      }),
    );
  }

  @Post('plan/:studentId')
  updatePlan(
    @Param('studentId') studentId: string,
    @Body()
    body: {
      major: string;
      completedCourses: string[];
      targetSemester: number;
      maxEcts: number;
    },
    @Req() req: { user: JwtPayload },
  ) {
    return firstValueFrom(
      this.svc.getSemesterPlan({
        student_id: studentId,
        studentId,
        major: body.major || req.user.major,
        completed_courses: body.completedCourses ?? [],
        completedCourses: body.completedCourses ?? [],
        target_semester: body.targetSemester ?? 1,
        targetSemester: body.targetSemester ?? 1,
        max_ects: body.maxEcts ?? 30,
        maxEcts: body.maxEcts ?? 30,
      }),
    );
  }

  @Get('path/:studentId')
  getPathRecommendation(
    @Param('studentId') studentId: string,
    @Query('major') major = '',
    @Query('completed') completed = '',
    @Req() req: { user: JwtPayload },
  ) {
    const completedCourses = completed ? completed.split(',') : [];
    return firstValueFrom(
      this.svc.getPathRecommendation({
        student_id: studentId,
        studentId,
        major: major || req.user.major,
        completed_courses: completedCourses,
        completedCourses,
      }),
    );
  }
}
