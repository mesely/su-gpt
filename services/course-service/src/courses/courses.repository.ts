import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course, CourseDocument } from './schemas/course.schema';

@Injectable()
export class CoursesRepository {
  constructor(
    @InjectModel(Course.name) private readonly model: Model<CourseDocument>,
  ) {}

  async findByFullCode(fullCode: string): Promise<CourseDocument | null> {
    return this.model.findOne({ fullCode: fullCode.toUpperCase() }).lean().exec() as unknown as CourseDocument | null;
  }

  async search(
    query: string,
    major?: string,
    faculty?: string,
    elType?: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ courses: CourseDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};

    if (query) {
      filter.$text = { $search: query };
    }
    if (major) filter.major = major.toUpperCase();
    if (faculty) filter.faculty = faculty.toUpperCase();
    if (elType) filter.elType = elType;

    const skip = (page - 1) * pageSize;
    const [courses, total] = await Promise.all([
      this.model.find(filter).skip(skip).limit(pageSize).lean().exec() as unknown as CourseDocument[],
      this.model.countDocuments(filter).exec(),
    ]);

    return { courses, total };
  }

  async findByCodes(fullCodes: string[]): Promise<CourseDocument[]> {
    const upper = fullCodes.map((c) => c.toUpperCase());
    return this.model.find({ fullCode: { $in: upper } }).lean().exec() as unknown as CourseDocument[];
  }

  async findByMajor(major: string): Promise<CourseDocument[]> {
    return this.model.find({ major: major.toUpperCase() }).lean().exec() as unknown as CourseDocument[];
  }

  async upsert(course: Partial<Course>): Promise<CourseDocument> {
    return this.model
      .findOneAndUpdate({ fullCode: course.fullCode }, { $set: course }, { upsert: true, new: true })
      .exec() as Promise<CourseDocument>;
  }

  async bulkUpsert(courses: Partial<Course>[]): Promise<void> {
    const ops = courses.map((c) => ({
      updateOne: {
        filter: { fullCode: c.fullCode },
        update: { $set: c },
        upsert: true,
      },
    }));
    await this.model.bulkWrite(ops);
  }
}
