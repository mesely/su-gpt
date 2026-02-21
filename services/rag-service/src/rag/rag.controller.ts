import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { RagService } from './rag.service';
import { VectorService } from './vector.service';
import { WhatsappParser } from '../ingestion/whatsapp.parser';
import { ExamIngestor } from '../ingestion/exam.ingestor';

@Controller()
export class RagController {
  constructor(
    private readonly rag: RagService,
    private readonly vector: VectorService,
    private readonly whatsappParser: WhatsappParser,
    private readonly examIngestor: ExamIngestor,
  ) {}

  // Server-side streaming RPC
  @GrpcMethod('RagService', 'Ask')
  ask(data: {
    question: string;
    student_id: string;
    major: string;
    completed_courses: string[];
    current_semester: number;
    context_type: string;
    extra_context?: Record<string, string>;
  }): Observable<{
    answer: string;
    context_type: string;
    source_chunks: string[];
    is_streaming: boolean;
    chunk: string;
    done: boolean;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
  }> {
    const stream$ = this.rag.ask({
      question: data.question,
      studentId: data.student_id,
      major: data.major,
      completedCourses: data.completed_courses ?? [],
      currentSemester: data.current_semester ?? 0,
      contextType: data.context_type,
      extraContext: data.extra_context,
    });

    return new Observable((observer) => {
      stream$.subscribe({
        next: (msg) => {
          observer.next({
            answer: msg.answer,
            context_type: msg.contextType,
            source_chunks: msg.sourceChunks,
            is_streaming: !msg.done,
            chunk: msg.chunk,
            done: msg.done,
            model: msg.model,
            prompt_tokens: msg.promptTokens,
            completion_tokens: msg.completionTokens,
          });
        },
        error: (err: Error) => observer.error(err),
        complete: () => observer.complete(),
      });
    });
  }

  @GrpcMethod('RagService', 'IngestDocument')
  async ingestDocument(data: {
    document_type: string;
    content: Buffer;
    batch_id: string;
    course_code: string;
    instructor: string;
    metadata: Record<string, string>;
  }) {
    if (data.document_type === 'whatsapp') {
      const rawText = data.content.toString('utf-8');
      const result = await this.whatsappParser.ingest(
        rawText,
        data.metadata?.uploadedBy ?? 'system',
      );
      return {
        batch_id: result.batchId,
        chunks_stored: result.chunksStored,
        success: true,
        error: '',
      };
    }

    if (data.document_type === 'exam_pdf') {
      const result = await this.examIngestor.ingest({
        content: data.content,
        courseCode: data.course_code,
        batchId: data.batch_id,
        metadata: data.metadata,
      });
      return {
        batch_id: result.batchId,
        chunks_stored: result.chunksStored,
        success: result.success,
        error: result.error ?? '',
      };
    }

    return {
      batch_id: data.batch_id,
      chunks_stored: 0,
      success: false,
      error: `Bilinmeyen döküman tipi: ${data.document_type}`,
    };
  }

  @GrpcMethod('RagService', 'GetSimilarChunks')
  async getSimilarChunks(data: {
    query: string;
    top_k: number;
    collection: string;
    filters: Record<string, string>;
  }) {
    const results = await this.rag.getSimilarChunks(
      data.query,
      data.collection ?? (process.env.CHROMA_COLLECTION_REVIEWS ?? 'su_reviews'),
      data.top_k ?? 8,
      data.filters,
    );

    return {
      chunks: results.map((r) => ({
        id: r.id,
        text: r.text,
        score: r.score,
        metadata: r.metadata,
      })),
    };
  }
}
