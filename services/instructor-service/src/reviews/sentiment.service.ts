import { Injectable } from '@nestjs/common';
import { Sentiment } from '../schemas/instructor-review.schema';

const POSITIVE_KEYWORDS = [
  'harika', 'süper', 'mükemmel', 'çok iyi', 'başarılı', 'anlaşılır',
  'güzel', 'faydalı', 'öğretici', 'tavsiye', 'kesinlikle al', 'iyi hoca',
  'anlayışlı', 'yardımsever', 'adil', 'ilham verici', 'değerli', 'excellent',
];

const NEGATIVE_KEYWORDS = [
  'berbat', 'zor', 'geçilmez', 'kötü', 'sıkıcı', 'anlaşılmaz',
  'gereksiz', 'tavsiye etmem', 'çok yüklü', 'çaresiz', 'hayal kırıklığı',
  'adaletsiz', 'ilgisiz', 'sert', 'katı', 'terrible', 'awful',
];

@Injectable()
export class SentimentService {
  classify(text: string): Sentiment {
    const lower = text.toLowerCase();
    const pos = POSITIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
    const neg = NEGATIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
    if (pos > neg) return 'positive';
    if (neg > pos) return 'negative';
    return 'neutral';
  }

  /**
   * -1.0 (çok negatif) ile 1.0 (çok pozitif) arasında normalize edilmiş skor.
   */
  computeScore(
    positiveCount: number,
    negativeCount: number,
    neutralCount: number,
  ): number {
    const total = positiveCount + negativeCount + neutralCount;
    if (total === 0) return 0;
    return parseFloat(
      ((positiveCount - negativeCount) / total).toFixed(3),
    );
  }

  extractKeywords(texts: string[], sentiment: Sentiment): string[] {
    const targetWords = sentiment === 'positive' ? POSITIVE_KEYWORDS : NEGATIVE_KEYWORDS;
    const freq = new Map<string, number>();

    for (const text of texts) {
      const lower = text.toLowerCase();
      for (const kw of targetWords) {
        if (lower.includes(kw)) {
          freq.set(kw, (freq.get(kw) ?? 0) + 1);
        }
      }
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kw]) => kw);
  }
}
