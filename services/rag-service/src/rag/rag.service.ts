import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { VectorService } from './vector.service';
import { PromptBuilder, ContextType } from './prompt-builder';
import { ChainOfThought } from './chain-of-thought';

// p-queue ESM modülü için dynamic import kullanıyoruz
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PQueue = require('p-queue').default as new (opts: { intervalCap: number; interval: number }) => {
  add<T>(fn: () => Promise<T>): Promise<T>;
};

interface MistralMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MistralStreamChunk {
  choices: { delta: { content?: string }; finish_reason: string | null }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface AskParams {
  question: string;
  studentId: string;
  major: string;
  completedCourses: string[];
  currentSemester: number;
  contextType?: string;
  extraContext?: Record<string, string>;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  // Free tier: 5 istek/dakika → güvenli limit olarak 1 istek/sn
  private readonly queue = new PQueue({ intervalCap: 1, interval: 1000 });
  private readonly apiKey = process.env.MISTRAL_API_KEY ?? '';
  private readonly model = process.env.MISTRAL_MODEL ?? 'mistral-small-latest';
  private readonly maxTokens = parseInt(process.env.MISTRAL_MAX_TOKENS ?? '2048', 10);
  private readonly temperature = parseFloat(process.env.MISTRAL_TEMPERATURE ?? '0.3');

  constructor(
    private readonly vector: VectorService,
    private readonly promptBuilder: PromptBuilder,
    private readonly cot: ChainOfThought,
  ) {}

  // ─── Ana RAG pipeline (streaming) ─────────────────────────────────────────

  ask(params: AskParams): Observable<{
    chunk: string;
    done: boolean;
    answer: string;
    sourceChunks: string[];
    model: string;
    promptTokens: number;
    completionTokens: number;
    contextType: string;
  }> {
    const subject = new Subject<{
      chunk: string;
      done: boolean;
      answer: string;
      sourceChunks: string[];
      model: string;
      promptTokens: number;
      completionTokens: number;
      contextType: string;
    }>();

    this.runPipeline(params, subject).catch((err: Error) => {
      this.logger.error('RAG pipeline hatası:', err.message);
      subject.next({
        chunk: `Hata: ${err.message}`,
        done: true,
        answer: '',
        sourceChunks: [],
        model: this.model,
        promptTokens: 0,
        completionTokens: 0,
        contextType: params.contextType ?? 'course_qa',
      });
      subject.complete();
    });

    return subject.asObservable();
  }

  private async runPipeline(
    params: AskParams,
    subject: Subject<unknown>,
  ) {
    // 1. Query expansion
    const queries = this.cot.expandQuery(params.question);
    this.logger.debug(`Genişletilmiş sorgular: ${queries.join(' | ')}`);

    // 2. Hybrid search
    const collection = process.env.CHROMA_COLLECTION_REVIEWS ?? 'su_reviews';
    const rawResults = await this.vector.hybridSearch(collection, queries, 8);

    // 3. Rerank → top 4
    const topChunks = this.vector.rerank(params.question, rawResults, 4);
    const sourceIds = topChunks.map((c) => c.id);

    // 4. Prompt build
    const contextType = (params.contextType as ContextType) ?? 'course_qa';
    const systemPrompt = this.cot.wrapSystemPrompt(
      this.promptBuilder.build({
        contextType,
        question: params.question,
        chunks: topChunks,
        major: params.major,
        completedCourses: params.completedCourses,
        currentSemester: params.currentSemester,
        extraContext: params.extraContext,
      }),
    );

    const messages: MistralMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: params.question },
    ];

    // 5. Mistral streaming (rate-limited)
    await this.queue.add(async () => {
      await this.streamMistral(
        messages,
        subject as Subject<{
          chunk: string;
          done: boolean;
          answer: string;
          sourceChunks: string[];
          model: string;
          promptTokens: number;
          completionTokens: number;
          contextType: string;
        }>,
        sourceIds,
        contextType,
      );
    });
  }

  private async streamMistral(
    messages: MistralMessage[],
    subject: Subject<{
      chunk: string;
      done: boolean;
      answer: string;
      sourceChunks: string[];
      model: string;
      promptTokens: number;
      completionTokens: number;
      contextType: string;
    }>,
    sourceIds: string[],
    contextType: string,
  ) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      const err = await res.text();
      throw new Error(`Mistral API hatası: ${err}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullAnswer = '';
    let promptTokens = 0;
    let completionTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter((l) => l.startsWith('data: '));

      for (const line of lines) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          subject.next({
            chunk: '',
            done: true,
            answer: fullAnswer,
            sourceChunks: sourceIds,
            model: this.model,
            promptTokens,
            completionTokens,
            contextType,
          });
          subject.complete();
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr) as MistralStreamChunk;
          const content = parsed.choices?.[0]?.delta?.content ?? '';
          if (content) {
            fullAnswer += content;
            subject.next({
              chunk: content,
              done: false,
              answer: '',
              sourceChunks: [],
              model: this.model,
              promptTokens: 0,
              completionTokens: 0,
              contextType,
            });
          }
          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens;
            completionTokens = parsed.usage.completion_tokens;
          }
        } catch {
          // parse hatası — devam et
        }
      }
    }

    // Stream beklenmedik şekilde bittiyse
    subject.next({
      chunk: '',
      done: true,
      answer: fullAnswer,
      sourceChunks: sourceIds,
      model: this.model,
      promptTokens,
      completionTokens,
      contextType,
    });
    subject.complete();
  }

  // ─── Benzer chunk ara ─────────────────────────────────────────────────────

  async getSimilarChunks(
    queryText: string,
    collection: string,
    topK: number,
    filters?: Record<string, string>,
  ) {
    const results = await this.vector.query(collection, queryText, topK, filters);
    return results.map((r) => ({
      id: r.id,
      text: r.text,
      score: r.score,
      metadata: r.metadata,
    }));
  }
}
