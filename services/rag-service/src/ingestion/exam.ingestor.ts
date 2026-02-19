import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { VectorService } from '../rag/vector.service';

export interface ExamIngestResult {
  batchId: string;
  chunksStored: number;
  success: boolean;
  error?: string;
}

@Injectable()
export class ExamIngestor {
  private readonly logger = new Logger(ExamIngestor.name);

  constructor(private readonly vector: VectorService) {}

  /**
   * PDF içeriğini (text olarak parse edilmiş) ChromaDB'ye ingest eder.
   * PDF parsing exam-service tarafından yapılır; bu servis text alır.
   */
  async ingest(params: {
    content: Buffer;
    courseCode: string;
    batchId?: string;
    metadata?: Record<string, string>;
  }): Promise<ExamIngestResult> {
    const batchId = params.batchId ?? uuidv4();
    const collection = process.env.CHROMA_COLLECTION_EXAMS ?? 'su_exams';

    try {
      const rawText = params.content.toString('utf-8');
      const chunks = this.chunkText(rawText, 300, 50);

      const docs = chunks.map((chunk, i) => ({
        id: `${batchId}-${i}`,
        text: chunk,
        metadata: {
          courseCode: params.courseCode,
          batchId,
          chunkIndex: String(i),
          ...params.metadata,
        },
      }));

      if (docs.length > 0) {
        await this.vector.addDocuments(collection, docs);
      }

      this.logger.log(`Sınav ingest: ${docs.length} chunk, kurs: ${params.courseCode}`);
      return { batchId, chunksStored: docs.length, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Exam ingest hatası:', msg);
      return { batchId, chunksStored: 0, success: false, error: msg };
    }
  }

  /**
   * Metni belirtilen token boyutunda örtüşmeli chunk'lara böler.
   * Token tahmini: kelime sayısı × 1.3
   */
  private chunkText(text: string, targetTokens: number, overlapTokens: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const wordsPerChunk = Math.floor(targetTokens / 1.3);
    const overlapWords = Math.floor(overlapTokens / 1.3);
    const chunks: string[] = [];

    let i = 0;
    while (i < words.length) {
      const end = Math.min(i + wordsPerChunk, words.length);
      chunks.push(words.slice(i, end).join(' '));
      i += wordsPerChunk - overlapWords;
    }

    return chunks.filter((c) => c.trim().length > 0);
  }
}
