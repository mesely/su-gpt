import { Injectable } from '@nestjs/common';

export interface CotStep {
  step: number;
  reasoning: string;
}

@Injectable()
export class ChainOfThought {
  /**
   * Kullanıcı sorusundan 3 alternatif arama sorgusu üretir.
   * Bunlar ChromaDB hybrid search için kullanılır.
   */
  expandQuery(question: string): string[] {
    const q = question.trim();
    const expansions: string[] = [q];

    // Türkçe eş anlamlı kelime genişletme
    const synonymMap: Record<string, string[]> = {
      ders: ['kurs', 'course', 'lecture'],
      hoca: ['öğretim üyesi', 'instructor', 'professor'],
      not: ['grade', 'puan', 'skor'],
      geçmek: ['başarmak', 'pass etmek'],
      önkoşul: ['prerequisite', 'gereksinim'],
      mezuniyet: ['graduation', 'bitirme'],
      dönem: ['semester', 'yarıyıl'],
      plan: ['planlama', 'schedule'],
    };

    let expanded = q;
    for (const [tr, synonyms] of Object.entries(synonymMap)) {
      if (q.toLowerCase().includes(tr)) {
        expanded = `${q} ${synonyms[0]}`;
        break;
      }
    }

    if (expanded !== q) expansions.push(expanded);

    // Soru → beyan dönüşümü
    const declarative = q
      .replace(/\?$/, '')
      .replace(/^(ne|nasıl|hangi|kim|neden)\s+/i, '')
      .trim();
    if (declarative && declarative !== q) {
      expansions.push(declarative);
    }

    return [...new Set(expansions)].slice(0, 3);
  }

  /**
   * System prompt'a CoT yönlendirmesi ekler.
   */
  wrapSystemPrompt(basePrompt: string): string {
    return (
      basePrompt +
      '\n\nAdım adım düşün. Her mantıksal adımı ayrı paragrafta açıkla, ' +
      'sonra kesin yanıtı ver.'
    );
  }

  /**
   * Yanıttan CoT adımlarını ayıklar (opsiyonel post-processing).
   */
  parseSteps(response: string): { steps: CotStep[]; finalAnswer: string } {
    const lines = response.split('\n');
    const steps: CotStep[] = [];
    const answerLines: string[] = [];
    let stepCounter = 0;
    let inAnswer = false;

    for (const line of lines) {
      const stepMatch = /^\d+\.\s+(.+)/.exec(line);
      if (stepMatch && !inAnswer) {
        stepCounter++;
        steps.push({ step: stepCounter, reasoning: stepMatch[1] });
      } else {
        inAnswer = true;
        answerLines.push(line);
      }
    }

    return {
      steps,
      finalAnswer: answerLines.join('\n').trim(),
    };
  }
}
