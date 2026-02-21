import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CoursesService } from '../courses/courses.service';

interface CategoryReq {
  minCredit: number;
  courses?: string[];
}

interface PathDef {
  name: string;
  requiredCourses: string[];
  electivePick: { count: number; from: string[] };
}

interface MajorRequirements {
  totalCredit: number;
  categories: Record<string, CategoryReq>;
  paths: Record<string, PathDef>;
}

type Requirements = Record<string, MajorRequirements>;

const DEFAULT_TOTAL_CREDIT = 125;
const DEFAULT_CATEGORY_REQ: Record<string, number> = {
  core: 42,
  area: 21,
  basicScience: 24,
  university: 23,
  free: 15,
  engineering: 24,
};

@Injectable()
export class GraduationService {
  private readonly requirements: Requirements;

  constructor(private readonly coursesService: CoursesService) {
    const filePath = path.join(__dirname, '../../data/graduation_requirements.json');
    this.requirements = this.loadRequirements(filePath);
  }

  async getGraduationStatus(
    studentId: string,
    major: string,
    completedCodes: string[],
    _currentSemester: number,
  ) {
    const normalizedMajor = (major || '').toUpperCase();
    const req = this.requirements[normalizedMajor];
    const completedCourses = await this.coursesService.findByCodes(completedCodes);

    const totalCompletedEcts = completedCourses.reduce(
      (sum, c) => sum + ((c as unknown as Record<string, number>).suCredit ?? 0),
      0,
    );

    const categoryConfig = req?.categories ?? this.buildDefaultCategories();
    const categoryStatuses = Object.entries(categoryConfig).map(([cat, catReq]) => {
      const completedEcts = this.sumCategory(cat, completedCourses as unknown as Record<string, unknown>[]);
      const missing = catReq.courses?.filter((code) => !completedCodes.includes(code)) ?? [];

      return {
        category: cat,
        completedEcts: Math.round(completedEcts * 10) / 10,
        requiredEcts: catReq.minCredit,
        satisfied: completedEcts >= catReq.minCredit,
        missingCourses: missing,
      };
    });

    const pathProgresses = req?.paths ? this.computePathProgress(req.paths, completedCodes) : [];
    const totalRequiredEcts = req?.totalCredit ?? DEFAULT_TOTAL_CREDIT;
    const remaining = Math.max(0, totalRequiredEcts - totalCompletedEcts);
    const avgCreditsPerSemester = 18;
    const estimatedSemestersLeft = Math.ceil(remaining / avgCreditsPerSemester);

    return {
      studentId,
      major: normalizedMajor || major,
      totalCompletedEcts: Math.round(totalCompletedEcts * 10) / 10,
      totalRequiredEcts,
      isEligible: totalCompletedEcts >= totalRequiredEcts && categoryStatuses.every((s) => s.satisfied),
      categoryStatuses,
      pathProgresses,
      estimatedSemestersLeft,
    };
  }

  private sumCategory(category: string, courses: Record<string, unknown>[]) {
    if (category === 'engineering') {
      return courses.reduce((sum, c) => {
        const cats = (c.categories as Record<string, number>) ?? {};
        return sum + Number(cats.engineering ?? 0);
      }, 0);
    }
    if (category === 'basicScience') {
      return courses.reduce((sum, c) => {
        const cats = (c.categories as Record<string, number>) ?? {};
        return sum + Number(cats.basicScience ?? 0);
      }, 0);
    }

    const catCourses = courses.filter((c) => this.matchesCategory(category, c));
    return catCourses.reduce((s, c) => s + Number(c.suCredit ?? 0), 0);
  }

  private matchesCategory(category: string, course: Record<string, unknown>) {
    const cats = (course.categories as Record<string, unknown>) ?? {};
    const elType = String(course.elType ?? '').toLowerCase();

    if (category === 'core') return Boolean(cats.isCore);
    if (category === 'area') return Boolean(cats.isArea);
    if (category === 'university') return elType === 'university';
    if (category === 'free') return elType === 'free';
    return false;
  }

  private computePathProgress(paths: Record<string, PathDef>, completedCodes: string[]) {
    return Object.entries(paths).map(([pathId, pathDef]) => {
      const reqCoursesDone = pathDef.requiredCourses.filter((c) => completedCodes.includes(c));
      const electiveDone = pathDef.electivePick.from.filter((c) => completedCodes.includes(c));
      const electiveNeeded = Math.min(pathDef.electivePick.count, pathDef.electivePick.from.length);
      const totalNeeded = pathDef.requiredCourses.length + electiveNeeded;
      const totalDone = reqCoursesDone.length + Math.min(electiveDone.length, electiveNeeded);
      const pct = totalNeeded > 0 ? (totalDone / totalNeeded) * 100 : 0;

      const missingReq = pathDef.requiredCourses.filter((c) => !completedCodes.includes(c));
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
  }

  private buildDefaultCategories(): Record<string, CategoryReq> {
    return Object.fromEntries(
      Object.entries(DEFAULT_CATEGORY_REQ).map(([k, minCredit]) => [k, { minCredit }]),
    );
  }

  private loadRequirements(filePath: string): Requirements {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const asRecord = parsed as Record<string, unknown>;

      // Legacy compact format: { CS: { totalCredit, categories, paths }, ... }
      if (asRecord.CS && typeof asRecord.CS === 'object') {
        return asRecord as unknown as Requirements;
      }

      // New format in repository has "programs"; graduation calculation falls back.
      return {};
    } catch {
      return {};
    }
  }
}
