import { Injectable, NotFoundException } from '@nestjs/common';
import { CoursesRepository } from './courses.repository';
import { CourseDocument } from './schemas/course.schema';

@Injectable()
export class CoursesService {
  constructor(private readonly repo: CoursesRepository) {}

  async getCourse(fullCode: string): Promise<CourseDocument> {
    const course = await this.repo.findByFullCode(fullCode);
    if (!course) throw new NotFoundException(`Ders bulunamadı: ${fullCode}`);
    return course;
  }

  async searchCourses(
    query: string,
    major?: string,
    faculty?: string,
    elType?: string,
    page = 1,
    pageSize = 20,
  ) {
    return this.repo.search(query, major, faculty, elType, page, pageSize);
  }

  async findByCodes(codes: string[]): Promise<CourseDocument[]> {
    return this.repo.findByCodes(codes);
  }

  async findByMajor(major: string): Promise<CourseDocument[]> {
    return this.repo.findByMajor(major);
  }

  // gRPC response mapper
  mapToProto(course: CourseDocument) {
    const doc = course as unknown as Record<string, unknown>;
    const cats = (doc.categories as Record<string, unknown>) ?? {};
    return {
      id: String(doc._id),
      major: doc.major,
      code: doc.code,
      fullCode: doc.fullCode,
      name: doc.name,
      ects: doc.ects,
      suCredit: doc.suCredit,
      faculty: doc.faculty,
      elType: doc.elType,
      categories: {
        engineering: cats.engineering ?? 0,
        basicScience: cats.basicScience ?? 0,
        isCore: cats.isCore ?? false,
        isArea: cats.isArea ?? false,
        isBasicScience: cats.isBasicScience ?? false,
      },
      prerequisites: (doc.prerequisites as string[]) ?? [],
      instructors: (doc.instructors as string[]) ?? [],
      description: doc.description ?? '',
    };
  }
}
