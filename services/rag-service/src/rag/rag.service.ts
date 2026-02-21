import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { VectorService } from './vector.service';
import { PromptBuilder, ContextType } from './prompt-builder';
import { ChainOfThought } from './chain-of-thought';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

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

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface CourseContextEntry {
  code: string;
  title: string;
  headerText: string;
  description: string;
  suCredit: number;
  ects: number;
  instructors: string[];
  lastOfferedTerms: string[];
  likelyOfferedThisTerm: boolean | null;
}

const COURSE_ALIASES: Record<string, string[]> = {
  DSA210: ['CS210'],
  CS210: ['DSA210'],
};

export interface AskParams {
  question: string;
  studentId: string;
  major: string;
  completedCourses: string[];
  currentSemester: number;
  contextType?: string;
  extraContext?: Record<string, string>;
}

export interface AskChunk {
  chunk: string;
  done: boolean;
  answer: string;
  sourceChunks: string[];
  model: string;
  promptTokens: number;
  completionTokens: number;
  contextType: string;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  // Free tier: 5 istek/dakika → güvenli limit olarak 1 istek/sn
  private readonly queue = new PQueue({ intervalCap: 1, interval: 1000 });
  private readonly provider = (process.env.LLM_PROVIDER ?? 'mistral').toLowerCase();
  private readonly mistralApiKey = process.env.MISTRAL_API_KEY ?? '';
  private readonly geminiApiKey = process.env.GEMINI_API_KEY ?? '';
  private readonly model =
    this.provider === 'gemini'
      ? process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'
      : process.env.MISTRAL_MODEL ?? 'mistral-small-latest';
  private readonly maxTokens = parseInt(process.env.MISTRAL_MAX_TOKENS ?? '2048', 10);
  private readonly temperature = parseFloat(process.env.MISTRAL_TEMPERATURE ?? '0.3');
  private readonly courseContext = new Map<string, CourseContextEntry>();
  private readonly instructorCourses = new Map<string, Set<string>>();
  private courseContextLoaded = false;

  constructor(
    private readonly vector: VectorService,
    private readonly promptBuilder: PromptBuilder,
    private readonly cot: ChainOfThought,
  ) {}

  // ─── Ana RAG pipeline (streaming) ─────────────────────────────────────────

  ask(params: AskParams): Observable<AskChunk> {
    const subject = new Subject<AskChunk>();

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
    subject: Subject<AskChunk>,
  ) {
    await this.ensureCourseContextLoaded();
    const normalizedCompleted = (params.completedCourses ?? [])
      .map((c) => String(c).replace(/\s+/g, '').toUpperCase())
      .filter(Boolean);
    const instructorEarly = await this.buildInstructorDirectAnswer(params.question);
    if (instructorEarly) {
      for (let i = 0; i < instructorEarly.length; i += 20) {
        subject.next({
          chunk: instructorEarly.slice(i, i + 20),
          done: false,
          answer: '',
          sourceChunks: [],
          model: this.model,
          promptTokens: 0,
          completionTokens: 0,
          contextType: params.contextType ?? 'course_qa',
        });
      }
      subject.next({
        chunk: '',
        done: true,
        answer: instructorEarly,
        sourceChunks: ['local_instructor_direct'],
        model: this.model,
        promptTokens: 0,
        completionTokens: 0,
        contextType: params.contextType ?? 'course_qa',
      });
      subject.complete();
      return;
    }
    const exactCode = this.extractExactSingleCodeQuery(params.question);
    if (exactCode && this.isCompletedOrEquivalent(exactCode, normalizedCompleted)) {
      const quick = `${exactCode} dersini tamamlamis gorunuyorsun. Bu dersin devaminda bir sonraki adim icin onkosul baglantisina gore 3xx/4xx seviyesinde ilgili dersleri planlayabiliriz. Istersen \"bu dersi nasil calismaliyim\" veya \"bu donem ne almaliyim\" diye devam edebilirsin.`;
      for (let i = 0; i < quick.length; i += 20) {
        subject.next({
          chunk: quick.slice(i, i + 20),
          done: false,
          answer: '',
          sourceChunks: [],
          model: this.model,
          promptTokens: 0,
          completionTokens: 0,
          contextType: params.contextType ?? 'course_qa',
        });
      }
      subject.next({
        chunk: '',
        done: true,
        answer: quick,
        sourceChunks: ['local_short_circuit'],
        model: this.model,
        promptTokens: 0,
        completionTokens: 0,
        contextType: params.contextType ?? 'course_qa',
      });
      subject.complete();
      return;
    }

    const dynamicChunks = await this.buildDynamicContextChunks(params.question);
    const completed = normalizedCompleted;
    if (completed.length > 0) {
      dynamicChunks.unshift({
        id: 'student_completed_courses',
        score: 1,
        metadata: { source: 'session' },
        text: `Ogrencinin tamamladigi dersler: ${completed.join(', ')}. Bu listedeki dersleri alinmis kabul et.`,
      });
    }

    // 1. Query expansion
    const queries = this.cot.expandQuery(params.question);
    this.logger.debug(`Genişletilmiş sorgular: ${queries.join(' | ')}`);

    // 2. Hybrid search
    const collection = process.env.CHROMA_COLLECTION_REVIEWS ?? 'su_reviews';
    const rawResults = await this.vector.hybridSearch(collection, queries, 8);

    // 3. Rerank → top 4
    const topChunks = this.vector.rerank(params.question, rawResults, 4);
    const mergedTopChunks = [...dynamicChunks, ...topChunks].slice(0, 6);
    const sourceIds = mergedTopChunks.map((c) => c.id);

    // 4. Prompt build
    const contextType = (params.contextType as ContextType) ?? 'course_qa';
    const systemPrompt = this.cot.wrapSystemPrompt(
      this.promptBuilder.build({
        contextType,
        question: params.question,
        chunks: mergedTopChunks,
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
      await this.streamByProvider(
        messages,
        params.question,
        systemPrompt,
        completed,
        subject,
        sourceIds,
        contextType,
      );
    });
  }

  private async buildDynamicContextChunks(question: string) {
    const codes = this.extractCourseCodes(question).slice(0, 6);
    const needCourseContext =
      codes.length > 0 ||
      /(hoca|instructor|prof|kim|kolay|zor|zor mu|çalışmalıyım|calismaliyim|nasıl çalış|nasil calis|öneri|aciliyor|acik|cakisma|cakisiyor)/i.test(question);
    if (!needCourseContext) return [];

    await this.ensureCourseContextLoaded();
    const chunks: Array<{ id: string; text: string; score: number; metadata: Record<string, string> }> = [];

    for (const code of codes) {
      const entry = this.courseContext.get(code);
      if (!entry) {
        const level = Number((code.match(/\d{3,5}/) ?? ['0'])[0]);
        const tier = level >= 400 ? 'ileri seviye' : level >= 300 ? 'orta-ileri seviye' : level >= 200 ? 'orta seviye' : 'temel seviye';
        chunks.push({
          id: `local_${code}_fallback`,
          score: 0.82,
          metadata: { source: 'local_course_code_fallback', code },
          text: `Ders kodu: ${code}. Bu ders ${tier} bir derstir. Onkosul ve acilma bilgisi baglamda yoksa kesin ifade kullanma; ogrencinin tamamladigi dersleri dikkate alarak cevapla.`,
        });
        continue;
      }
      const shortDesc = entry.description ? entry.description.replace(/\s+/g, ' ').slice(0, 500) : 'Açıklama bulunamadı.';
      const offerTerms = entry.lastOfferedTerms.length ? entry.lastOfferedTerms.slice(0, 3).join(', ') : 'bilinmiyor';
      const availability =
        entry.likelyOfferedThisTerm === null
          ? 'bilinmiyor'
          : entry.likelyOfferedThisTerm
            ? 'muhtemelen acik'
            : 'bu donem acik gorunmuyor';
      chunks.push({
        id: `local_${code}`,
        score: 1,
        metadata: { source: 'local_course_context', code },
        text: [
          `Ders: ${entry.headerText || `${entry.code} ${entry.title}`}`,
          `SU kredi: ${entry.suCredit || 0} | ECTS: ${entry.ects || 0}`,
          `Dersi veren(son dönem): ${entry.instructors.length ? entry.instructors.join(', ') : 'bilinmiyor'}`,
          `Bu donem acilma durumu: ${availability}. Son acildigi donemler: ${offerTerms}`,
          `Açıklama: ${shortDesc}`,
        ].join('\n'),
      });
    }

    const instructorContext = this.findInstructorContext(question);
    if (instructorContext) {
      chunks.push({
        id: 'local_instructor_context',
        score: 0.95,
        metadata: { source: 'local_instructor_context' },
        text: instructorContext,
      });
    }

    const webSnippet = await this.fetchWebSnippet(question);
    if (webSnippet) {
      chunks.push({
        id: 'web_snippet',
        score: 0.92,
        metadata: { source: 'web' },
        text: `Web özeti: ${webSnippet}`,
      });
    }

    return chunks;
  }

  private async fetchWebSnippet(question: string): Promise<string> {
    if (!/(hoca|instructor|prof|kim|hangi alanda|nasıl çalış|kolay|zor)/i.test(question)) return '';
    try {
      const query = `Sabanci Universitesi ${question}`;
      const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
      const res = await fetch(endpoint);
      if (!res.ok) return '';
      const data = (await res.json()) as {
        AbstractText?: string;
        RelatedTopics?: Array<{ Text?: string }>;
      };
      const abstract = (data.AbstractText ?? '').trim();
      if (abstract) return abstract.slice(0, 420);
      const related = data.RelatedTopics?.map((x) => x.Text ?? '').find((x) => x.trim().length > 0) ?? '';
      if (related) return related.slice(0, 420);
      const htmlRes = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
      if (!htmlRes.ok) return '';
      const html = await htmlRes.text();
      const snippets = Array.from(html.matchAll(/<a[^>]*class=\"result__snippet\"[^>]*>(.*?)<\/a>/g))
        .map((m) => String(m[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      return (snippets[0] ?? '').slice(0, 420);
    } catch {
      return '';
    }
  }

  private extractCourseCodes(question: string): string[] {
    const rx = /\b([A-ZÇĞİÖŞÜ]{2,6}\s?\d{3,5}[A-Z]?)\b/gi;
    const set = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = rx.exec(question)) !== null) {
      set.add(m[1].replace(/\s+/g, '').toUpperCase());
    }
    for (const code of Array.from(set)) {
      for (const alias of COURSE_ALIASES[code] ?? []) {
        set.add(alias);
      }
    }
    return Array.from(set);
  }

  private extractExactSingleCodeQuery(question: string): string | null {
    const normalized = String(question ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) return null;
    if (!/^[A-ZÇĞİÖŞÜ]{2,6}\d{3,5}[A-Z]?$/.test(normalized)) return null;
    return normalized;
  }

  private isCompletedOrEquivalent(code: string, completed: string[]) {
    if (completed.includes(code)) return true;
    const aliases = COURSE_ALIASES[code] ?? [];
    return aliases.some((a) => completed.includes(a));
  }

  private async buildInstructorDirectAnswer(question: string): Promise<string | null> {
    if (!/(kim|hoca|prof|instructor)/i.test(question)) return null;
    const match = this.findInstructorMatch(question);
    if (!match) {
      return 'Hangi hocayi sordugunu yazar misin? Ornek: "Onur Varol kim, hangi dersleri veriyor?"';
    }
    const undergradCourses = match.courses
      .filter((code) => {
        const n = Number((code.match(/\d{3,5}/) ?? ['0'])[0]);
        return n > 0 && n < 500;
      })
      .sort((a, b) => a.localeCompare(b));
    const courseLines = undergradCourses.length
      ? undergradCourses.map((c) => `- ${c}`).join('\n')
      : '- Lisans seviyesinde ders bulunamadi.';
    const web = await this.fetchWebSnippet(`${match.name} Sabanci University research area`);
    const area = web ? `\n\nArastirma odagi (web ozeti): ${web}` : '';
    return `Ogretim uyesi: ${match.name}\nSabanci Universitesi son donem ders kayitlarina gore lisans dersleri:\n${courseLines}${area}`;
  }

  private findInstructorMatch(question: string): { name: string; courses: string[] } | null {
    const lower = question.toLowerCase().replace(/\s+/g, ' ');
    let best: { name: string; courses: string[]; hit: number } | null = null;
    for (const [name, courses] of this.instructorCourses.entries()) {
      const parts = name.split(/\s+/).filter((p) => p.length > 2);
      if (parts.length === 0) continue;
      const hitCount = parts.filter((p) => lower.includes(p)).length;
      if (hitCount < 1) continue;
      const arr = Array.from(courses).slice(0, 16);
      if (!best || hitCount > best.hit || (hitCount === best.hit && arr.length > best.courses.length)) {
        best = { name, courses: arr, hit: hitCount };
      }
    }
    return best ? { name: best.name, courses: best.courses } : null;
  }

  private async ensureCourseContextLoaded() {
    if (this.courseContextLoaded) return;
    this.courseContextLoaded = true;

    const baseDir = path.join(__dirname, '../../../course-service/data');
    const coursePagePath = path.join(baseDir, 'all_coursepage_info.jsonl');
    const scheduleDir = path.join(baseDir, 'schedule');

    await this.loadCoursePageInfo(coursePagePath);
    await this.loadScheduleInstructorsFromDir(scheduleDir);
  }

  private async loadScheduleInstructorsFromDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.jsonl')).sort();
    for (const file of files) {
      await this.loadScheduleInstructors(path.join(dirPath, file));
    }
  }

  private async loadCoursePageInfo(filePath: string) {
    if (!fs.existsSync(filePath)) return;
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as {
          course_id?: string;
          title?: string;
          header_text?: string;
          description?: string;
          su_credits?: number;
          ects?: number;
          last_offered_terms?: Array<{ term?: string }>;
        };
        const code = (row.course_id ?? '').toUpperCase();
        if (!code) continue;
        const terms = Array.isArray(row.last_offered_terms)
          ? row.last_offered_terms
              .map((x) => String(x.term ?? '').trim())
              .filter((x) => x.length > 0)
          : [];
        this.courseContext.set(code, {
          code,
          title: row.title ?? '',
          headerText: row.header_text ?? '',
          description: row.description ?? '',
          suCredit: Number(row.su_credits ?? 0),
          ects: Number(row.ects ?? 0),
          instructors: [],
          lastOfferedTerms: terms,
          likelyOfferedThisTerm: this.isLikelyOfferedInCurrentTerm(terms),
        });
      } catch {
        // ignore
      }
    }
  }

  private async loadScheduleInstructors(filePath: string) {
    if (!fs.existsSync(filePath)) return;
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as {
          course_id?: string;
          meetings?: Array<{ instructors?: string }>;
        };
        const code = (row.course_id ?? '').toUpperCase();
        if (!code) continue;
        const instructors = (row.meetings ?? [])
          .map((m) => (m.instructors ?? '').replace(/\(\s*P\s*\)/g, '').trim())
          .filter((x) => x.length > 0);
        for (const instructor of instructors) {
          const normalized = instructor.toLowerCase();
          if (!this.instructorCourses.has(normalized)) {
            this.instructorCourses.set(normalized, new Set());
          }
          this.instructorCourses.get(normalized)!.add(code);
        }
        if (!this.courseContext.has(code)) {
          this.courseContext.set(code, {
            code,
            title: '',
            headerText: code,
            description: '',
            suCredit: 0,
            ects: 0,
            instructors: Array.from(new Set(instructors)),
            lastOfferedTerms: [],
            likelyOfferedThisTerm: null,
          });
          continue;
        }
        const prev = this.courseContext.get(code)!;
        this.courseContext.set(code, {
          ...prev,
          instructors: Array.from(new Set([...prev.instructors, ...instructors])).slice(0, 8),
        });
      } catch {
        // ignore
      }
    }
  }

  private findInstructorContext(question: string): string {
    if (!/(kim|hoca|prof|instructor)/i.test(question)) return '';
    const lower = question.toLowerCase().replace(/\s+/g, ' ');
    let best: { name: string; courses: string[] } | null = null;
    for (const [name, courses] of this.instructorCourses.entries()) {
      const parts = name.split(/\s+/).filter((p) => p.length > 2);
      if (parts.length === 0) continue;
      const hitCount = parts.filter((p) => lower.includes(p)).length;
      if (hitCount < 1) continue;
      const arr = Array.from(courses).slice(0, 8);
      if (!best || arr.length > best.courses.length) {
        best = { name, courses: arr };
      }
    }
    if (!best) return '';
    return `Ogretim uyesi: ${best.name}. Son donem verilerinde gecen dersler: ${best.courses.join(', ')}.`;
  }

  private isLikelyOfferedInCurrentTerm(terms: string[]) {
    if (terms.length === 0) return null;
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    let currentTerm = '';
    if (month >= 9) currentTerm = `Fall ${year}-${year + 1}`;
    else if (month >= 2) currentTerm = `Spring ${year - 1}-${year}`;
    else currentTerm = `Fall ${year - 1}-${year}`;
    return terms.some((t) => t === currentTerm);
  }

  private async streamByProvider(
    messages: MistralMessage[],
    question: string,
    systemPrompt: string,
    completedCourses: string[],
    subject: Subject<AskChunk>,
    sourceIds: string[],
    contextType: string,
  ) {
    if (this.provider === 'gemini') {
      await this.streamGemini(question, systemPrompt, completedCourses, subject, sourceIds, contextType);
      return;
    }
    await this.streamMistral(messages, completedCourses, subject, sourceIds, contextType);
  }

  private async streamMistral(
    messages: MistralMessage[],
    completedCourses: string[],
    subject: Subject<AskChunk>,
    sourceIds: string[],
    contextType: string,
  ) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.mistralApiKey}`,
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
          const sanitized = this.sanitizeAnswerWithCompleted(fullAnswer, completedCourses);
          subject.next({
            chunk: '',
            done: true,
            answer: sanitized,
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
    const sanitized = this.sanitizeAnswerWithCompleted(fullAnswer, completedCourses);
    subject.next({
      chunk: '',
      done: true,
      answer: sanitized,
      sourceChunks: sourceIds,
      model: this.model,
      promptTokens,
      completionTokens,
      contextType,
    });
    subject.complete();
  }

  private async streamGemini(
    question: string,
    systemPrompt: string,
    completedCourses: string[],
    subject: Subject<AskChunk>,
    sourceIds: string[],
    contextType: string,
  ) {
    if (!this.geminiApiKey) {
      throw new Error('GEMINI_API_KEY tanımlı değil');
    }

    const preferred = Array.from(new Set([
      this.model,
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
    ]));
    const discovered = await this.discoverGeminiModels('generateContent');
    const models = Array.from(new Set([...preferred, ...discovered]));
    const versions = ['v1beta'];
    let data: GeminiGenerateResponse | null = null;
    let lastError = '';

    for (const version of versions) {
      for (const model of models) {
        const endpoint = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${this.geminiApiKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\nSoru: ${question}` }],
              },
            ],
            generationConfig: {
              temperature: this.temperature,
              maxOutputTokens: this.maxTokens,
            },
          }),
        });
        if (!res.ok) {
          lastError = await res.text();
          continue;
        }
        data = (await res.json()) as GeminiGenerateResponse;
        break;
      }
      if (data) break;
    }

    if (!data) {
      throw new Error(`Gemini API hatası: ${lastError}`);
    }

    const rawAnswer =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const fullAnswer = this.sanitizeAnswerWithCompleted(this.sanitizeAnswer(rawAnswer), completedCourses);
    const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens =
      data.usageMetadata?.candidatesTokenCount ??
      Math.max(0, (data.usageMetadata?.totalTokenCount ?? 0) - promptTokens);

    for (let i = 0; i < fullAnswer.length; i += 20) {
      const chunk = fullAnswer.slice(i, i + 20);
      subject.next({
        chunk,
        done: false,
        answer: '',
        sourceChunks: [],
        model: this.model,
        promptTokens: 0,
        completionTokens: 0,
        contextType,
      });
    }

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

  private sanitizeAnswer(answer: string) {
    if (!answer) return answer;
    let out = answer;
    const cotBlocks = [
      /Adım adım düşün[\s\S]*?YANIT:?/i,
      /Adım adım düşünce[\s\S]*?YANIT:?/i,
      /Chain of Thought[\s\S]*?YANIT:?/i,
    ];
    for (const rx of cotBlocks) {
      if (rx.test(out)) {
        out = out.replace(rx, '').trim();
      }
    }
    out = out.replace(/^(\*\*Adım adım düşün:?\*\*|Adım adım düşün:?)\s*/i, '').trim();
    return out;
  }

  private sanitizeAnswerWithCompleted(answer: string, completedCourses: string[]) {
    if (!answer) return answer;
    if (!completedCourses || completedCourses.length === 0) return answer;
    const wrongMemory =
      /(hic\s+ders\s+almad|hiç\s+ders\s+almad|hen[uü]z\s+tamamlanm[ıi]ş\s+ders(?:in|iniz)?\s+(?:yok|bulunmad[ıi][ğg][ıi])|tamamlanm[ıi]ş\s+ders(?:in|iniz)?\s+olmad[ıi][ğg][ıi]|ilk\s+d[öo]nem)/i;
    if (!wrongMemory.test(answer)) return answer;
    let fixed = answer
      .replace(/hen[uü]z[^.?!]*tamamlanm[ıi]ş[^.?!]*[.?!]/gi, '')
      .replace(/ilk\s+d[öo]nem[^.?!]*[.?!]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!fixed) fixed = answer;
    return `Tamamladigin dersleri dikkate aliyorum: ${completedCourses.join(', ')}.\n\n${fixed}`.trim();
  }

  private async discoverGeminiModels(method: 'generateContent' | 'embedContent') {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.geminiApiKey}`;
      const res = await fetch(endpoint);
      if (!res.ok) return [] as string[];
      const data = (await res.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      };
      const names = (data.models ?? [])
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes(method))
        .map((m) => String(m.name ?? '').replace(/^models\//, ''))
        .filter((x) => x.length > 0);
      return names;
    } catch {
      return [] as string[];
    }
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
