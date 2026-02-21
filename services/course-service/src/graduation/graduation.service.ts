import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CoursesService } from '../courses/courses.service';

interface CategoryReq {
  minCredit: number;
  courses?: string[];
  pools?: string[];
}

interface PathDef {
  name: string;
  requiredCourses: string[];
  electivePick: { count: number; from: string[] };
}

interface MajorRequirements {
  major: string;
  totalCredit: number;
  categories: Record<string, CategoryReq>;
  paths: Record<string, PathDef>;
}

type Requirements = Record<string, MajorRequirements>;

@Injectable()
export class GraduationService {
  private readonly requirements: Requirements;

  constructor(private readonly coursesService: CoursesService) {
    const filePath = path.join(__dirname, '../../data/graduation_requirements.json');
    this.requirements = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Requirements;
  }

  async getGraduationStatus(
    studentId: string,
    major: string,
    completedCodes: string[],
    currentSemester: number,
  ) {
    const req = this.requirements[major.toUpperCase()];
    if (!req) {
      return this.emptyStatus(studentId, major);
    }

    const completedCourses = await this.coursesService.findByCodes(completedCodes);

    // Use suCredit for all calculations
    const totalCompletedEcts = completedCourses.reduce(
      (sum, c) => sum + ((c as unknown as Record<string, number>).suCredit ?? 0),
      0,
    );

    const categoryStatuses = Object.entries(req.categories).map(([cat, catReq]) => {
      const catCourses = completedCourses.filter((c) => {
        const cats = (c as unknown as Record<string, Record<string, unknown>>).categories ?? {};
        if (cat === 'core') return cats.isCore;
        if (cat === 'area') return cats.isArea;
        if (cat === 'basicScience') return cats.isBasicScience;
        return false;
      });
      const completedEcts = catCourses.reduce(
        (s, c) => s + ((c as unknown as Record<string, number>).suCredit ?? 0),
        0,
      );
      const missing =
        catReq.courses?.filter((code) => !completedCodes.includes(code)) ?? [];

      return {
        category: cat,
        completedEcts,
        requiredEcts: catReq.minCredit,
        satisfied: completedEcts >= catReq.minCredit,
        missingCourses: missing,
      };
    });

    const pathProgresses = Object.entries(req.paths).map(([pathId, pathDef]) => {
      const reqCoursesDone = pathDef.requiredCourses.filter((c) =>
        completedCodes.includes(c),
      );
      const electiveDone = pathDef.electivePick.from.filter((c) =>
        completedCodes.includes(c),
      );
      const electiveNeeded = Math.min(
        pathDef.electivePick.count,
        pathDef.electivePick.from.length,
      );
      const totalNeeded =
        pathDef.requiredCourses.length + electiveNeeded;
      const totalDone =
        reqCoursesDone.length + Math.min(electiveDone.length, electiveNeeded);
      const pct = totalNeeded > 0 ? (totalDone / totalNeeded) * 100 : 0;

      const missingReq = pathDef.requiredCourses.filter(
        (c) => !completedCodes.includes(c),
      );
      const missingElective =
        electiveDone.length < electiveNeeded
          ? pathDef.electivePick.from.filter((c) => !completedCodes.includes(c))
          : [];

      return {
        pathId,
        pathName: pathDef.name,
        completionPct: Math.round(pct * 10) / 10,
        completed: [...reqCoursesDone, ...electiveDone],
        missing: [...missingReq, ...missingElective],
      };
    });

    const remainingEcts = req.totalCredit - totalCompletedEcts;
    const avgCreditsPerSemester = 18; // ~18 SU credits per semester
    const estimatedSemestersLeft = Math.max(
      0,
      Math.ceil(remainingEcts / avgCreditsPerSemester),
    );

    return {
      studentId,
      major,
      totalCompletedEcts,
      totalRequiredEcts: req.totalCredit,
      isEligible: totalCompletedEcts >= req.totalCredit &&
        categoryStatuses.every((s) => s.satisfied),
      categoryStatuses,
      pathProgresses,
      estimatedSemestersLeft,
    };
  }

  private emptyStatus(studentId: string, major: string) {
    return {
      studentId,
      major,
      totalCompletedEcts: 0,
      totalRequiredEcts: 136,
      isEligible: false,
      categoryStatuses: [],
      pathProgresses: [],
      estimatedSemestersLeft: 8,
    };
  }
}
