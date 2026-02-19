import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface PathDef {
  name: string;
  requiredCourses: string[];
  electivePick: { count: number; from: string[] };
}

interface MajorRequirements {
  paths: Record<string, PathDef>;
}

type Requirements = Record<string, MajorRequirements>;

@Injectable()
export class PathService {
  private readonly requirements: Requirements;

  constructor() {
    const filePath = path.join(__dirname, '../../data/graduation_requirements.json');
    this.requirements = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Requirements;
  }

  getPathRecommendation(
    major: string,
    completedCodes: string[],
  ) {
    const majorReq = this.requirements[major.toUpperCase()];
    if (!majorReq || !majorReq.paths) {
      return {
        pathId: '',
        pathName: 'Bilinmiyor',
        matchScore: 0,
        rationale: 'Bu major için path tanımı bulunamadı.',
        recommendedCourses: [],
      };
    }

    let bestPath = '';
    let bestScore = -1;
    let bestDef: PathDef | null = null;

    for (const [pathId, pathDef] of Object.entries(majorReq.paths)) {
      const reqDone = pathDef.requiredCourses.filter((c) => completedCodes.includes(c)).length;
      const electDone = pathDef.electivePick.from.filter((c) => completedCodes.includes(c)).length;
      const total = pathDef.requiredCourses.length + pathDef.electivePick.count;
      const done = reqDone + Math.min(electDone, pathDef.electivePick.count);
      const score = total > 0 ? done / total : 0;

      if (score > bestScore) {
        bestScore = score;
        bestPath = pathId;
        bestDef = pathDef;
      }
    }

    if (!bestDef) {
      return {
        pathId: '',
        pathName: 'Bilinmiyor',
        matchScore: 0,
        rationale: 'Path öneri hesaplanamadı.',
        recommendedCourses: [],
      };
    }

    const missingReq = bestDef.requiredCourses.filter((c) => !completedCodes.includes(c));
    const missingElect = bestDef.electivePick.from.filter((c) => !completedCodes.includes(c));
    const recommended = [...missingReq, ...missingElect].slice(0, 5);

    return {
      pathId: bestPath,
      pathName: bestDef.name,
      matchScore: Math.round(bestScore * 100) / 100,
      rationale: `Tamamlanan dersler analiz edildi. ${bestDef.name} path'ine en yüksek uyum skoru hesaplandı.`,
      recommendedCourses: recommended,
    };
  }
}
