import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsController {
  private readonly logger = new Logger(ReviewsController.name);

  constructor(private readonly reviews: ReviewsService) {}

  // ─── GetInstructorSummary ─────────────────────────────────────────────────

  @GrpcMethod('InstructorService', 'GetInstructorSummary')
  async getInstructorSummary(data: {
    instructor_name: string;
    course_code?: string;
  }) {
    const summary = await this.reviews.getInstructorSummary(
      data.instructor_name,
      data.course_code,
    );
    return {
      instructor_name:        summary.instructorName,
      course_code:            summary.courseCode,
      positive_count:         summary.positiveCount,
      negative_count:         summary.negativeCount,
      neutral_count:          summary.neutralCount,
      top_positive_keywords:  summary.topPositiveKeywords,
      top_negative_keywords:  summary.topNegativeKeywords,
      recommendation:         summary.recommendation,
      sentiment_score:        summary.sentimentScore,
    };
  }

  // ─── UploadWhatsappBatch ──────────────────────────────────────────────────

  @GrpcMethod('InstructorService', 'UploadWhatsappBatch')
  async uploadWhatsappBatch(data: {
    batch_id: string;
    content: Buffer;
    uploaded_by: string;
    filename: string;
  }) {
    const batchId   = data.batch_id || uuidv4();
    const rawText   = Buffer.isBuffer(data.content)
      ? data.content.toString('utf-8')
      : String(data.content);

    const parsed = this.reviews.parseWhatsapp(rawText);
    const totalMessages = rawText.split('\n').length;

    await this.reviews.savePendingBatch({
      batchId,
      uploadedBy:    data.uploaded_by ?? 'unknown',
      filename:      data.filename ?? '',
      reviews:       parsed,
      totalMessages,
    });

    this.logger.log(`Batch ${batchId}: ${parsed.length} yorum parse edildi (${totalMessages} satır).`);

    return {
      batch_id:       batchId,
      total_messages: totalMessages,
      parsed_reviews: parsed.length,
      success:        true,
      error:          '',
      preview:        parsed.slice(0, 10).map((r) => ({
        instructor_name: r.instructorName,
        course_code:     r.courseCode,
        anonymized_text: r.anonymizedText,
        sentiment:       r.sentiment,
      })),
    };
  }

  // ─── ConfirmUpload ────────────────────────────────────────────────────────

  @GrpcMethod('InstructorService', 'ConfirmUpload')
  async confirmUpload(data: {
    batch_id: string;
    approved: boolean;
    approved_by: string;
  }) {
    if (!data.approved) {
      await this.reviews.deleteBatch(data.batch_id);
      this.logger.log(`Batch ${data.batch_id} reddedildi ve silindi.`);
      return { batch_id: data.batch_id, ingested_count: 0, success: true, error: '' };
    }

    try {
      const count = await this.reviews.confirmBatch(data.batch_id);
      this.logger.log(`Batch ${data.batch_id}: ${count} yorum MongoDB'ye yazıldı.`);
      return { batch_id: data.batch_id, ingested_count: count, success: true, error: '' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { batch_id: data.batch_id, ingested_count: 0, success: false, error: msg };
    }
  }

  // ─── DeleteBatch ──────────────────────────────────────────────────────────

  @GrpcMethod('InstructorService', 'DeleteBatch')
  async deleteBatch(data: { batch_id: string }) {
    try {
      const count = await this.reviews.deleteBatch(data.batch_id);
      return { success: true, deleted_count: count, error: '' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, deleted_count: 0, error: msg };
    }
  }

  // ─── ListInstructors ─────────────────────────────────────────────────────

  @GrpcMethod('InstructorService', 'ListInstructors')
  async listInstructors(data: {
    faculty?: string;
    course_code?: string;
    page?: number;
    page_size?: number;
  }) {
    const result = await this.reviews.listInstructors({
      faculty:    data.faculty,
      courseCode: data.course_code,
      page:       data.page ?? 1,
      pageSize:   data.page_size ?? 20,
    });

    return {
      instructors: result.instructors.map((i) => ({
        instructor_name: i.instructorName,
        total_reviews:   i.totalReviews,
        sentiment_score: i.sentimentScore,
        courses:         i.courses,
      })),
      total: result.total,
    };
  }
}
