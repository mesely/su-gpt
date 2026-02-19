import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ExamDoc } from '../schemas/exam.schema';
import { MinioService } from './minio.service';

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    @InjectModel('Exam') private readonly examModel: Model<ExamDoc>,
    private readonly minio: MinioService,
  ) {}

  // ─── List / filter ────────────────────────────────────────────────────────

  async getExams(filter: {
    courseCode?: string;
    year?: number;
    semester?: string;
    type?: string;
    page?: number;
    pageSize?: number;
  }) {
    const query: Record<string, unknown> = {};
    if (filter.courseCode) query.courseCode = filter.courseCode;
    if (filter.year && filter.year > 0) query.year = filter.year;
    if (filter.semester) query.semester = filter.semester;
    if (filter.type) query.type = filter.type;

    const page     = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;

    const [exams, total] = await Promise.all([
      this.examModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec() as unknown as ExamDoc[],
      this.examModel.countDocuments(query).exec(),
    ]);

    return { exams, total };
  }

  // ─── Single exam ──────────────────────────────────────────────────────────

  async getExam(examId: string): Promise<ExamDoc> {
    const exam = await this.examModel.findById(examId).lean().exec();
    if (!exam) throw new NotFoundException(`Sınav bulunamadı: ${examId}`);
    return exam as unknown as ExamDoc;
  }

  // ─── Presigned URL ────────────────────────────────────────────────────────

  async getPresignedUrl(examId: string) {
    const exam = await this.getExam(examId);
    const { url, expiresAt } = await this.minio.presignedUrl(exam.minioKey);
    return {
      examId,
      presignedUrl: url,
      ttlSeconds:   3600,
      expiresAt,
    };
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  async uploadExam(params: {
    courseCode: string;
    year: number;
    semester: string;
    type: string;
    fileName: string;
    content: Buffer;
    uploadedBy: string;
  }) {
    // MinIO key: "CS412/2024/fall/midterm/exam.pdf"
    const minioKey = [
      params.courseCode,
      params.year,
      params.semester,
      params.type,
      `${Date.now()}_${params.fileName}`,
    ].join('/');

    await this.minio.upload(minioKey, params.content);

    const doc = await this.examModel.create({
      courseCode: params.courseCode,
      year:       params.year,
      semester:   params.semester,
      type:       params.type,
      fileName:   params.fileName,
      minioKey,
      uploadedBy: params.uploadedBy,
    });

    this.logger.log(`Sınav yüklendi: ${minioKey}`);
    return doc;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteExam(examId: string) {
    const exam = await this.getExam(examId);

    // MinIO'dan sil
    try {
      await this.minio.delete(exam.minioKey);
    } catch (err) {
      this.logger.warn(`MinIO sil başarısız (${exam.minioKey}): ${err}`);
    }

    await this.examModel.findByIdAndDelete(examId).exec();
    return { success: true };
  }
}
