import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CoursesService } from './courses.service';
import { GraduationService } from '../graduation/graduation.service';
import { PathService } from '../graduation/path.service';

@Controller()
export class CoursesController {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly graduationService: GraduationService,
    private readonly pathService: PathService,
  ) {}

  @GrpcMethod('CourseService', 'GetCourse')
  async getCourse(data: { code: string }) {
    const course = await this.coursesService.getCourse(data.code);
    return this.coursesService.mapToProto(course);
  }

  @GrpcMethod('CourseService', 'SearchCourses')
  async searchCourses(data: {
    query: string;
    major: string;
    faculty: string;
    el_type: string;
    page: number;
    page_size: number;
  }) {
    const { courses, total } = await this.coursesService.searchCourses(
      data.query,
      data.major,
      data.faculty,
      data.el_type,
      data.page || 1,
      data.page_size || 20,
    );
    return {
      courses: courses.map((c) => this.coursesService.mapToProto(c)),
      total,
      page: data.page || 1,
      pageSize: data.page_size || 20,
    };
  }

  @GrpcMethod('CourseService', 'GetGraduationStatus')
  async getGraduationStatus(data: {
    student_id: string;
    major: string;
    completed_courses: string[];
    current_semester: number;
  }) {
    const status = await this.graduationService.getGraduationStatus(
      data.student_id,
      data.major,
      data.completed_courses ?? [],
      data.current_semester ?? 1,
    );

    return {
      studentId: status.studentId,
      major: status.major,
      totalCompletedEcts: status.totalCompletedEcts,
      totalRequiredEcts: status.totalRequiredEcts,
      isEligible: status.isEligible,
      categoryStatuses: status.categoryStatuses.map((s) => ({
        category: s.category,
        completedEcts: s.completedEcts,
        requiredEcts: s.requiredEcts,
        satisfied: s.satisfied,
        missingCourses: s.missingCourses,
      })),
      pathProgresses: status.pathProgresses.map((p) => ({
        pathId: p.pathId,
        pathName: p.pathName,
        completionPct: p.completionPct,
        completed: p.completed,
        missing: p.missing,
      })),
      estimatedSemestersLeft: status.estimatedSemestersLeft,
    };
  }

  @GrpcMethod('CourseService', 'GetPathRecommendation')
  async getPathRecommendation(data: {
    student_id: string;
    major: string;
    completed_courses: string[];
  }) {
    const rec = this.pathService.getPathRecommendation(
      data.major,
      data.completed_courses ?? [],
    );
    return {
      pathId: rec.pathId,
      pathName: rec.pathName,
      matchScore: rec.matchScore,
      rationale: rec.rationale,
      recommendedCourses: rec.recommendedCourses,
    };
  }

  @GrpcMethod('CourseService', 'GetSemesterPlan')
  async getSemesterPlan(data: {
    student_id: string;
    major: string;
    completed_courses: string[];
    target_semester: number;
    max_ects: number;
  }) {
    const maxEcts = data.max_ects || 30;
    const allMajorCourses = await this.coursesService.findByMajor(data.major);
    const completed = new Set(data.completed_courses ?? []);

    // Alınmamış dersleri filtrele, önkoşulları karşılanmış olanları seç
    const candidates = allMajorCourses.filter((c) => {
      const doc = c as unknown as Record<string, unknown>;
      if (completed.has(doc.fullCode as string)) return false;
      const prereqs = (doc.prerequisites as string[]) ?? [];
      return prereqs.every((p) => completed.has(p));
    });

    // ECTS limitine kadar doldur
    const planned: typeof candidates = [];
    let totalEcts = 0;
    for (const c of candidates) {
      const doc = c as unknown as Record<string, number>;
      if (totalEcts + (doc.ects ?? 0) > maxEcts) continue;
      planned.push(c);
      totalEcts += doc.ects ?? 0;
    }

    return {
      studentId: data.student_id,
      semester: data.target_semester,
      courses: planned.map((c) => {
        const doc = c as unknown as Record<string, unknown>;
        const cats = (doc.categories as Record<string, unknown>) ?? {};
        let category = 'free';
        if (cats.isCore) category = 'core';
        else if (cats.isArea) category = 'area';
        else if (cats.isBasicScience) category = 'basicScience';
        return {
          fullCode: doc.fullCode,
          name: doc.name,
          ects: doc.ects,
          category,
          isPrerequisiteSatisfied: true,
        };
      }),
      totalEcts,
      warning: planned.length === 0 ? 'Uygun ders bulunamadı.' : '',
    };
  }
}
