import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { VectorService } from '../rag/vector.service';

export interface ParsedMessage {
  date: string;
  sender: string;
  text: string;
  instructor?: string;
  courseCode?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface ParseResult {
  batchId: string;
  messages: ParsedMessage[];
  chunksStored: number;
}

// Bilinen hoca isimleri (normalize edilmiş)
const KNOWN_INSTRUCTORS = [
  'Ercan Solak', 'Erkay Savas', 'Yusuf Leblebici',
  'Albert Levi', 'Hüsnü Yenigün', 'Öznur Taştan',
  'Berrin Yanıkoğlu', 'Cem Say', 'Emre Sefer',
];

// Türkçe pozitif/negatif anahtar kelimeler
const POSITIVE_KEYWORDS = [
  'harika', 'süper', 'mükemmel', 'çok iyi', 'başarılı', 'anlaşılır',
  'güzel', 'faydalı', 'öğretici', 'tavsiye', 'kesinlikle al', 'iyi hoca',
];
const NEGATIVE_KEYWORDS = [
  'berbat', 'zor', 'geçilmez', 'kötü', 'sıkıcı', 'anlaşılmaz',
  'gereksiz', 'tavsiye etmem', 'çok yüklü', 'çaresiz', 'hayal kırıklığı',
];

@Injectable()
export class WhatsappParser {
  private readonly logger = new Logger(WhatsappParser.name);

  // Android: [DD.MM.YYYY, HH:MM:SS] Sender: Message
  private readonly androidRegex = /^\[(\d{2}\.\d{2}\.\d{4}), \d{2}:\d{2}:\d{2}\] (.+?): (.+)$/;
  // iOS: DD.MM.YYYY HH:MM - Sender: Message
  private readonly iosRegex = /^(\d{2}\.\d{2}\.\d{4}) \d{2}:\d{2} - (.+?): (.+)$/;

  // Türkiye telefon numarası, URL, isimleri temizleme
  private readonly phoneRegex = /(\+90|0)[\s-]?5\d{2}[\s-]?\d{3}[\s-]?\d{4}/g;
  private readonly urlRegex = /https?:\/\/\S+/g;
  private readonly courseCodeRegex = /\b([A-Z]{2,4}\s*\d{3})\b/g;

  constructor(private readonly vector: VectorService) {}

  parse(rawText: string): ParsedMessage[] {
    const lines = rawText.split('\n');
    const messages: ParsedMessage[] = [];
    let currentMsg: Partial<ParsedMessage> | null = null;

    for (const line of lines) {
      const parsed = this.parseLine(line);
      if (parsed) {
        if (currentMsg?.text) messages.push(currentMsg as ParsedMessage);
        currentMsg = parsed;
      } else if (currentMsg && line.trim()) {
        // Çok satırlı mesaj devamı
        currentMsg.text = (currentMsg.text ?? '') + ' ' + line.trim();
      }
    }
    if (currentMsg?.text) messages.push(currentMsg as ParsedMessage);

    return messages;
  }

  private parseLine(line: string): ParsedMessage | null {
    const match = this.androidRegex.exec(line) ?? this.iosRegex.exec(line);
    if (!match) return null;

    const [, date, sender, rawText] = match;
    const cleaned = this.cleanPii(rawText);
    const courseCode = this.extractCourseCode(cleaned);
    const instructor = this.extractInstructor(cleaned);
    const sentiment = this.classifySentiment(cleaned);

    return { date, sender, text: cleaned, courseCode, instructor, sentiment };
  }

  private cleanPii(text: string): string {
    return text
      .replace(this.phoneRegex, '[TELEFON]')
      .replace(this.urlRegex, '[LINK]')
      .trim();
  }

  private extractCourseCode(text: string): string | undefined {
    const match = this.courseCodeRegex.exec(text.toUpperCase());
    this.courseCodeRegex.lastIndex = 0;
    return match ? match[1].replace(/\s+/, '') : undefined;
  }

  private extractInstructor(text: string): string | undefined {
    const lower = text.toLowerCase();
    for (const name of KNOWN_INSTRUCTORS) {
      const parts = name.toLowerCase().split(' ');
      if (parts.some((p) => lower.includes(p))) return name;
    }
    return undefined;
  }

  private classifySentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const lower = text.toLowerCase();
    const posScore = POSITIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
    const negScore = NEGATIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
    if (posScore > negScore) return 'positive';
    if (negScore > posScore) return 'negative';
    return 'neutral';
  }

  // ─── Ingest to ChromaDB ──────────────────────────────────────────────────

  async ingest(rawText: string, uploadedBy: string): Promise<ParseResult> {
    const batchId = uuidv4();
    const messages = this.parse(rawText);
    const collection = process.env.CHROMA_COLLECTION_REVIEWS ?? 'su_reviews';

    // Chunk: her mesaj bir chunk (200-400 token arası filtrele)
    const docs = messages
      .filter((m) => m.text.length > 20 && m.text.length < 2000)
      .map((m) => ({
        id: `${batchId}-${uuidv4()}`,
        text: m.text,
        metadata: {
          instructor: m.instructor ?? '',
          courseCode: m.courseCode ?? '',
          sentiment: m.sentiment,
          batchId,
          uploadedBy,
          date: m.date,
        },
      }));

    if (docs.length > 0) {
      try {
        await this.vector.addDocuments(collection, docs);
      } catch (err) {
        this.logger.error('ChromaDB ingest hatası:', err);
      }
    }

    this.logger.log(`Batch ${batchId}: ${docs.length} chunk ChromaDB'ye eklendi.`);
    return { batchId, messages, chunksStored: docs.length };
  }
}
