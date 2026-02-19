import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { InstructorReviewDoc, InstructorReviewSchema } from '../schemas/instructor-review.schema';
import { PendingBatchDoc } from '../schemas/pending-batch.schema';
import { SentimentService } from './sentiment.service';

// Bilinen hoca isimleri
const KNOWN_INSTRUCTORS = [
  'Ercan Solak', 'Erkay Savas', 'Yusuf Leblebici',
  'Albert Levi', 'Hüsnü Yenigün', 'Öznur Taştan',
  'Berrin Yanıkoğlu', 'Cem Say', 'Emre Sefer',
];

// Regex
const PHONE_RE = /(\+90|0)[\s-]?5\d{2}[\s-]?\d{3}[\s-]?\d{4}/g;
const URL_RE   = /https?:\/\/\S+/g;
const COURSE_RE = /\b([A-Z]{2,4}\s?\d{3})\b/g;

export interface ParsedReview {
  instructorName: string;
  courseCode: string;
  anonymizedText: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  date: string;
  sender: string;
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  // Android: [DD.MM.YYYY, HH:MM:SS] Sender: Message
  private readonly androidRe = /^\[(\d{2}\.\d{2}\.\d{4}), \d{2}:\d{2}:\d{2}\] (.+?): (.+)$/;
  // iOS: DD.MM.YYYY HH:MM - Sender: Message
  private readonly iosRe     = /^(\d{2}\.\d{2}\.\d{4}) \d{2}:\d{2} - (.+?): (.+)$/;

  constructor(
    @InjectModel('InstructorReview')
    private readonly reviewModel: Model<InstructorReviewDoc>,
    @InjectModel('PendingBatch')
    private readonly batchModel: Model<PendingBatchDoc>,
    private readonly sentiment: SentimentService,
  ) {}

  // ─── WhatsApp parse ───────────────────────────────────────────────────────

  parseWhatsapp(rawText: string): ParsedReview[] {
    const lines = rawText.split('\n');
    const reviews: ParsedReview[] = [];
    let current: Partial<ParsedReview> | null = null;

    for (const line of lines) {
      const match = this.androidRe.exec(line) ?? this.iosRe.exec(line);
      if (match) {
        if (current?.anonymizedText) reviews.push(current as ParsedReview);
        const [, date, sender, raw] = match;
        const cleaned = this.cleanPii(raw);
        current = {
          date,
          sender,
          anonymizedText: cleaned,
          instructorName: this.extractInstructor(cleaned),
          courseCode:     this.extractCourseCode(cleaned),
          sentiment:      this.sentiment.classify(cleaned),
        };
      } else if (current && line.trim()) {
        current.anonymizedText = (current.anonymizedText ?? '') + ' ' + line.trim();
      }
    }
    if (current?.anonymizedText) reviews.push(current as ParsedReview);

    return reviews.filter(
      (r) => r.anonymizedText.length > 20 && r.instructorName,
    );
  }

  private cleanPii(text: string): string {
    return text.replace(PHONE_RE, '[TELEFON]').replace(URL_RE, '[LINK]').trim();
  }

  private extractInstructor(text: string): string {
    const lower = text.toLowerCase();
    for (const name of KNOWN_INSTRUCTORS) {
      if (name.split(' ').some((p) => lower.includes(p.toLowerCase()))) return name;
    }
    return '';
  }

  private extractCourseCode(text: string): string {
    COURSE_RE.lastIndex = 0;
    const match = COURSE_RE.exec(text.toUpperCase());
    return match ? match[1].replace(/\s+/, '') : '';
  }

  // ─── Pending batch kaydet ─────────────────────────────────────────────────

  async savePendingBatch(params: {
    batchId: string;
    uploadedBy: string;
    filename: string;
    reviews: ParsedReview[];
    totalMessages: number;
  }): Promise<void> {
    await this.batchModel.findOneAndUpdate(
      { batchId: params.batchId },
      {
        batchId:       params.batchId,
        uploadedBy:    params.uploadedBy,
        filename:      params.filename,
        totalMessages: params.totalMessages,
        reviews:       params.reviews.map((r) => ({
          instructorName: r.instructorName,
          courseCode:     r.courseCode,
          anonymizedText: r.anonymizedText,
          sentiment:      r.sentiment,
        })),
      },
      { upsert: true },
    ).exec();
  }

  // ─── Batch onayla → MongoDB'ye yaz ───────────────────────────────────────

  async confirmBatch(batchId: string): Promise<number> {
    const batch = await this.batchModel.findOne({ batchId }).lean().exec();
    if (!batch) throw new Error(`Batch bulunamadı: ${batchId}`);

    const docs = batch.reviews.map((r) => ({
      instructorName: r.instructorName,
      courseCode:     r.courseCode,
      sentiment:      r.sentiment,
      anonymizedText: r.anonymizedText,
      source:         'whatsapp' as const,
      uploadBatch:    batchId,
    }));

    await this.reviewModel.insertMany(docs);
    await this.batchModel.deleteOne({ batchId }).exec();
    return docs.length;
  }

  // ─── Batch sil ────────────────────────────────────────────────────────────

  async deleteBatch(batchId: string): Promise<number> {
    // Pending batch ise sil
    const pendingDel = await this.batchModel.deleteOne({ batchId }).exec();
    if (pendingDel.deletedCount > 0) return pendingDel.deletedCount;

    // Onaylanmış reviewları sil
    const result = await this.reviewModel.deleteMany({ uploadBatch: batchId }).exec();
    return result.deletedCount;
  }

  // ─── Hoca özeti ───────────────────────────────────────────────────────────

  async getInstructorSummary(instructorName: string, courseCode?: string) {
    const filter: Record<string, unknown> = { instructorName };
    if (courseCode) filter.courseCode = courseCode;

    const reviews = await this.reviewModel.find(filter).lean().exec();

    const positiveCount = reviews.filter((r) => r.sentiment === 'positive').length;
    const negativeCount = reviews.filter((r) => r.sentiment === 'negative').length;
    const neutralCount  = reviews.filter((r) => r.sentiment === 'neutral').length;

    const texts = reviews.map((r) => r.anonymizedText);
    const topPositiveKeywords = this.sentiment.extractKeywords(texts, 'positive');
    const topNegativeKeywords = this.sentiment.extractKeywords(texts, 'negative');
    const sentimentScore      = this.sentiment.computeScore(positiveCount, negativeCount, neutralCount);

    const recommendation = this.buildRecommendation(sentimentScore, instructorName, courseCode);

    return {
      instructorName,
      courseCode: courseCode ?? '',
      positiveCount,
      negativeCount,
      neutralCount,
      topPositiveKeywords,
      topNegativeKeywords,
      sentimentScore,
      recommendation,
    };
  }

  private buildRecommendation(
    score: number,
    instructorName: string,
    courseCode?: string,
  ): string {
    const course = courseCode ? ` için ${courseCode}` : '';
    if (score >= 0.5) return `${instructorName}${course} dersi kesinlikle tavsiye edilir.`;
    if (score >= 0.1) return `${instructorName}${course} genel olarak olumlu değerlendiriliyor.`;
    if (score >= -0.1) return `${instructorName}${course} hakkında görüşler karışık.`;
    return `${instructorName}${course} için alternatif hoca aramanızı öneririz.`;
  }

  // ─── Hoca listesi ─────────────────────────────────────────────────────────

  async listInstructors(params: {
    faculty?: string;
    courseCode?: string;
    page: number;
    pageSize: number;
  }) {
    const filter: Record<string, unknown> = {};
    if (params.courseCode) filter.courseCode = params.courseCode;

    const pipeline: PipelineStage[] = [
      { $match: filter },
      {
        $group: {
          _id: '$instructorName',
          totalReviews: { $sum: 1 },
          positive: { $sum: { $cond: [{ $eq: ['$sentiment', 'positive'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$sentiment', 'negative'] }, 1, 0] } },
          neutral:  { $sum: { $cond: [{ $eq: ['$sentiment', 'neutral'] }, 1, 0] } },
          courses:  { $addToSet: '$courseCode' },
        },
      },
      { $sort: { totalReviews: -1 as const } },
      { $skip: (params.page - 1) * params.pageSize },
      { $limit: params.pageSize },
    ];

    const results = await this.reviewModel.aggregate(pipeline).exec() as Array<{
      _id: string;
      totalReviews: number;
      positive: number;
      negative: number;
      neutral: number;
      courses: string[];
    }>;
    const total   = await this.reviewModel.countDocuments(filter).exec();

    return {
      instructors: results.map((r) => ({
        instructorName: r._id,
        totalReviews:   r.totalReviews,
        sentimentScore: this.sentiment.computeScore(r.positive, r.negative, r.neutral),
        courses:        r.courses,
      })),
      total,
    };
  }
}
