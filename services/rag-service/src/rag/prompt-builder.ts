import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { SearchResult } from './vector.service';

export type ContextType =
  | 'course_qa'
  | 'graduation_check'
  | 'instructor_review'
  | 'path_advisor';

const TEMPLATE_FILES: Record<ContextType, string> = {
  course_qa: 'course_qa.txt',
  graduation_check: 'graduation_check.txt',
  instructor_review: 'instructor_review.txt',
  path_advisor: 'path_advisor.txt',
};

@Injectable()
export class PromptBuilder {
  private readonly templates = new Map<ContextType, string>();
  private readonly fewShots: string;

  constructor() {
    const promptsDir = path.join(__dirname, '../../prompts');
    for (const [type, file] of Object.entries(TEMPLATE_FILES)) {
      const fullPath = path.join(promptsDir, file);
      if (fs.existsSync(fullPath)) {
        this.templates.set(type as ContextType, fs.readFileSync(fullPath, 'utf-8'));
      }
    }

    // Few-shot örneklerini birleştir
    const fewShotsDir = path.join(promptsDir, 'few_shots');
    const fewShotFiles = fs.existsSync(fewShotsDir)
      ? fs
          .readdirSync(fewShotsDir)
          .filter((f) => f.endsWith('.txt'))
          .filter((f) => !f.toLowerCase().includes('instructor'))
      : [];
    this.fewShots = fewShotFiles
      .map((f) => fs.readFileSync(path.join(fewShotsDir, f), 'utf-8'))
      .map((raw) => {
        const q = raw.match(/SORU:\s*([\s\S]*?)\n(?:DÜŞÜN:|DUSUN:|YANIT:)/i)?.[1]?.trim() ?? '';
        const a = raw.match(/YANIT:\s*([\s\S]*)$/i)?.[1]?.trim() ?? raw.trim();
        if (!q) return `YANIT ORNEGI:\n${a}`;
        return `SORU ORNEGI: ${q}\nYANIT ORNEGI:\n${a}`;
      })
      .join('\n\n---\n\n');
  }

  build(params: {
    contextType: ContextType;
    question: string;
    chunks: SearchResult[];
    major: string;
    completedCourses: string[];
    currentSemester: number;
    extraContext?: Record<string, string>;
  }): string {
    const template = this.templates.get(params.contextType);
    if (!template) {
      return this.fallback(params.question, params.chunks);
    }

    const contextText = params.chunks
      .map((c, i) => `[${i + 1}] ${c.text}`)
      .join('\n\n');

    const semesterText = params.currentSemester && params.currentSemester > 0
      ? String(params.currentSemester)
      : 'Bilinmiyor';

    let prompt = template
      .replace('{context}', contextText)
      .replace('{question}', params.question)
      .replace('{major}', params.major)
      .replace('{completed_courses}', params.completedCourses.join(', ') || 'Yok')
      .replace('{current_semester}', semesterText)
      .replace('{review_chunks}', contextText)
      .replace('{completed}', params.completedCourses.join(', ') || 'Yok')
      .replace('{semester}', semesterText);

    // Extra context varsa ekle
    if (params.extraContext) {
      for (const [key, val] of Object.entries(params.extraContext)) {
        prompt = prompt.replace(`{${key}}`, val);
      }
    }

    // Few-shot örneklerini başa ekle (ilgili context type için)
    if (this.fewShots) {
      prompt = `ÖRNEK YANITLAR:\n${this.fewShots}\n\n---\n\n${prompt}`;
    }

    return prompt;
  }

  private fallback(question: string, chunks: SearchResult[]): string {
    const ctx = chunks.map((c) => c.text).join('\n\n');
    return `Bağlam:\n${ctx}\n\nSoru: ${question}\n\nYanıtla:`;
  }
}
