import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ExamsService } from './exams.service';
import { ExamDoc } from '../schemas/exam.schema';

@Controller()
export class ExamsController {
  private readonly logger = new Logger(ExamsController.name);

  constructor(private readonly exams: ExamsService) {}

  // ─── GetExams ─────────────────────────────────────────────────────────────

  @GrpcMethod('ExamService', 'GetExams')
  async getExams(data: {
    course_code?: string;
    year?: number;
    semester?: string;
    type?: string;
    page?: number;
    page_size?: number;
  }) {
    const result = await this.exams.getExams({
      courseCode: data.course_code,
      year:       data.year,
      semester:   data.semester,
      type:       data.type,
      page:       data.page ?? 1,
      pageSize:   data.page_size ?? 20,
    });

    return {
      exams: result.exams.map((e) => this.toResponse(e)),
      total: result.total,
    };
  }

  // ─── GetExam ──────────────────────────────────────────────────────────────

  @GrpcMethod('ExamService', 'GetExam')
  async getExam(data: { exam_id: string }) {
    const exam = await this.exams.getExam(data.exam_id);
    return this.toResponse(exam);
  }

  // ─── GetPresignedUrl ──────────────────────────────────────────────────────

  @GrpcMethod('ExamService', 'GetPresignedUrl')
  async getPresignedUrl(data: { exam_id: string }) {
    const result = await this.exams.getPresignedUrl(data.exam_id);
    return {
      exam_id:       result.examId,
      presigned_url: result.presignedUrl,
      ttl_seconds:   result.ttlSeconds,
      expires_at:    result.expiresAt,
    };
  }

  // ─── UploadExam ───────────────────────────────────────────────────────────

  @GrpcMethod('ExamService', 'UploadExam')
  async uploadExam(data: {
    course_code: string;
    year: number;
    semester: string;
    type: string;
    file_name: string;
    content: Buffer;
    uploaded_by: string;
  }) {
    const doc = await this.exams.uploadExam({
      courseCode: data.course_code,
      year:       data.year,
      semester:   data.semester,
      type:       data.type,
      fileName:   data.file_name,
      content:    Buffer.isBuffer(data.content) ? data.content : Buffer.from(data.content),
      uploadedBy: data.uploaded_by,
    });
    return this.toResponse(doc);
  }

  // ─── DeleteExam ───────────────────────────────────────────────────────────

  @GrpcMethod('ExamService', 'DeleteExam')
  async deleteExam(data: { exam_id: string }) {
    try {
      await this.exams.deleteExam(data.exam_id);
      return { success: true, error: '' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  private toResponse(e: ExamDoc) {
    return {
      id:          String(e._id ?? ''),
      course_code: e.courseCode,
      year:        e.year,
      semester:    e.semester,
      type:        e.type,
      file_name:   e.fileName,
      minio_key:   e.minioKey,
      uploaded_by: e.uploadedBy,
      created_at:  e.createdAt instanceof Date
        ? e.createdAt.toISOString()
        : String(e.createdAt ?? ''),
    };
  }
}
