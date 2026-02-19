import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Schema, Document } from 'mongoose';

// ─── Embedding cache schema ────────────────────────────────────────────────
interface EmbeddingCacheDoc extends Document {
  text: string;
  embedding: number[];
  createdAt: Date;
}

const EmbeddingCacheSchema = new Schema<EmbeddingCacheDoc>(
  {
    text: { type: String, required: true, unique: true },
    embedding: { type: [Number], required: true },
  },
  { collection: 'embeddingCache', timestamps: true },
);

// ─── ChromaDB types ────────────────────────────────────────────────────────
interface ChromaAddPayload {
  ids: string[];
  documents: string[];
  embeddings: number[][];
  metadatas: Record<string, string>[];
}

interface ChromaQueryResult {
  ids: string[][];
  documents: (string | null)[][];
  distances: number[][];
  metadatas: (Record<string, string> | null)[][];
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, string>;
}

@Injectable()
export class VectorService implements OnModuleInit {
  private readonly logger = new Logger(VectorService.name);
  private readonly chromaBase: string;
  private EmbeddingCache: Model<EmbeddingCacheDoc>;

  constructor(
    @InjectModel('EmbeddingCache')
    private readonly cacheModel: Model<EmbeddingCacheDoc>,
  ) {
    const host = process.env.CHROMA_HOST ?? 'localhost';
    const port = process.env.CHROMA_PORT ?? '8000';
    this.chromaBase = `http://${host}:${port}`;
    this.EmbeddingCache = cacheModel;
  }

  async onModuleInit() {
    await this.ensureCollections();
  }

  // ─── Collections ─────────────────────────────────────────────────────────

  private async ensureCollections() {
    const collections = [
      process.env.CHROMA_COLLECTION_REVIEWS ?? 'su_reviews',
      process.env.CHROMA_COLLECTION_EXAMS ?? 'su_exams',
    ];
    for (const name of collections) {
      try {
        await this.chromaPost('/api/v1/collections', { name, get_or_create: true });
      } catch {
        this.logger.warn(`Koleksiyon oluşturulamadı: ${name}`);
      }
    }
  }

  // ─── Embedding ───────────────────────────────────────────────────────────

  async embed(text: string): Promise<number[]> {
    // Cache'den bak
    const cached = await this.EmbeddingCache.findOne({ text }).lean().exec();
    if (cached?.embedding) return cached.embedding;

    // Mistral embed API
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error('MISTRAL_API_KEY tanımlı değil');

    const res = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_EMBED_MODEL ?? 'mistral-embed',
        input: [text],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Mistral embed hatası: ${err}`);
    }

    const data = (await res.json()) as { data: { embedding: number[] }[] };
    const embedding = data.data[0].embedding;

    // Cache'e kaydet
    await this.EmbeddingCache.findOneAndUpdate(
      { text },
      { text, embedding },
      { upsert: true },
    ).exec();

    return embedding;
  }

  // ─── Add documents ────────────────────────────────────────────────────────

  async addDocuments(
    collection: string,
    docs: { id: string; text: string; metadata: Record<string, string> }[],
  ): Promise<void> {
    const embeddings = await Promise.all(docs.map((d) => this.embed(d.text)));
    const payload: ChromaAddPayload = {
      ids: docs.map((d) => d.id),
      documents: docs.map((d) => d.text),
      embeddings,
      metadatas: docs.map((d) => d.metadata),
    };
    await this.chromaPost(`/api/v1/collections/${collection}/add`, payload);
  }

  // ─── Query ───────────────────────────────────────────────────────────────

  async query(
    collection: string,
    queryText: string,
    topK = 8,
    filters?: Record<string, string>,
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.embed(queryText);

    const body: Record<string, unknown> = {
      query_embeddings: [queryEmbedding],
      n_results: topK,
      include: ['documents', 'distances', 'metadatas'],
    };

    if (filters && Object.keys(filters).length > 0) {
      body.where = Object.fromEntries(
        Object.entries(filters).map(([k, v]) => [k, { $eq: v }]),
      );
    }

    const result = (await this.chromaPost(
      `/api/v1/collections/${collection}/query`,
      body,
    )) as ChromaQueryResult;

    const ids = result.ids?.[0] ?? [];
    const docs = result.documents?.[0] ?? [];
    const distances = result.distances?.[0] ?? [];
    const metadatas = result.metadatas?.[0] ?? [];

    return ids.map((id, i) => ({
      id,
      text: docs[i] ?? '',
      score: 1 - (distances[i] ?? 1),   // cosine similarity
      metadata: (metadatas[i] as Record<string, string>) ?? {},
    }));
  }

  // ─── Hybrid search (multi-query) ─────────────────────────────────────────

  async hybridSearch(
    collection: string,
    queries: string[],
    topK = 8,
    filters?: Record<string, string>,
  ): Promise<SearchResult[]> {
    const allResults = await Promise.all(
      queries.map((q) => this.query(collection, q, topK, filters)),
    );

    // Deduplicate by id, keep highest score
    const map = new Map<string, SearchResult>();
    for (const results of allResults) {
      for (const r of results) {
        const existing = map.get(r.id);
        if (!existing || existing.score < r.score) {
          map.set(r.id, r);
        }
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // ─── Rerank (simple cross-encoder simulation) ────────────────────────────

  rerank(query: string, results: SearchResult[], topN = 4): SearchResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/);
    return results
      .map((r) => {
        const textLower = r.text.toLowerCase();
        const termHits = queryTerms.filter((t) => textLower.includes(t)).length;
        return { ...r, score: r.score + termHits * 0.05 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  private async chromaPost(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.chromaBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ChromaDB hatası [${path}]: ${text}`);
    }
    return res.json();
  }
}

export const EmbeddingCacheMongooseSchema = EmbeddingCacheSchema;
