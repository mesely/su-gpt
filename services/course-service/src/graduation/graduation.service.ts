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
  required: 11,
  core: 31,
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
    const normalizedCompletedCodes = Array.from(
      new Set(
        (completedCodes ?? []).map((c) => String(c).replace(/\s+/g, '').toUpperCase()).filter(Boolean),
      ),
    );
    const completedCourses = await this.coursesService.findByCodes(normalizedCompletedCodes);

    const totalCompletedEcts = completedCourses.reduce(
      (sum, c) => {
        const doc = c as unknown as Record<string, unknown>;
        return sum + Number(doc.suCredit ?? doc.su_credit ?? 0);
      },
      0,
    );

    const categoryConfig = req?.categories ?? this.buildDefaultCategories();
    const requiredCourseSet = new Set(
      (categoryConfig.required?.courses ?? []).map((c) => c.replace(/\s+/g, '').toUpperCase()),
    );
    const categoryStatuses = Object.entries(categoryConfig).map(([cat, catReq]) => {
      const completedEcts = this.sumCategory(
        cat,
        completedCourses as unknown as Record<string, unknown>[],
        catReq,
        requiredCourseSet,
      );
      const missing = (catReq.courses ?? [])
        .map((code) => code.replace(/\s+/g, '').toUpperCase())
        .filter((code) => !normalizedCompletedCodes.includes(code));

      return {
        category: cat,
        completedEcts: Math.round(completedEcts * 10) / 10,
        requiredEcts: catReq.minCredit,
        satisfied: completedEcts >= catReq.minCredit,
        missingCourses: missing,
      };
    });

    const pathProgresses = req?.paths ? this.computePathProgress(req.paths, normalizedCompletedCodes) : [];
    const totalRequiredEcts = req?.totalCredit ?? DEFAULT_TOTAL_CREDIT;
    const remaining = Math.max(0, totalRequiredEcts - totalCompletedEcts);
    const avgCreditsPerSemester = 15;
    const estimatedSemestersLeft =
      totalCompletedEcts <= 0
        ? 8
        : Math.max(0, Math.ceil(remaining / avgCreditsPerSemester));

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

  private sumCategory(
    category: string,
    courses: Record<string, unknown>[],
    req?: CategoryReq,
    requiredCourseSet: Set<string> = new Set(),
  ) {
    const reqCodes = new Set((req?.courses ?? []).map((c) => c.replace(/\s+/g, '').toUpperCase()));
    if (reqCodes.size > 0 && (category === 'required' || category === 'core' || category === 'area')) {
      return courses.reduce((sum, c) => {
        const code = String(c.fullCode ?? '').replace(/\s+/g, '').toUpperCase();
        if (!reqCodes.has(code)) return sum;
        const doc = c as Record<string, unknown>;
        return sum + Number(doc.suCredit ?? doc.su_credit ?? 0);
      }, 0);
    }

    if (category === 'engineering') {
      // Sum SU credits of courses that have engineering content (not the raw Engineering weight)
      return courses.reduce((sum, c) => {
        const cats = (c.categories as Record<string, number>) ?? {};
        if (Number(cats.engineering ?? 0) <= 0) return sum;
        const doc = c as Record<string, unknown>;
        return sum + Number(doc.suCredit ?? doc.su_credit ?? 0);
      }, 0);
    }
    if (category === 'basicScience') {
      // Sum SU credits of courses that have basic science content (not the raw Basic_Science weight)
      return courses.reduce((sum, c) => {
        const cats = (c.categories as Record<string, number>) ?? {};
        if (Number(cats.basicScience ?? cats.basic_science ?? 0) <= 0) return sum;
        const doc = c as Record<string, unknown>;
        return sum + Number(doc.suCredit ?? doc.su_credit ?? 0);
      }, 0);
    }

    const catCourses = courses.filter((c) => this.matchesCategory(category, c, req, requiredCourseSet));
    return catCourses.reduce((s, c) => {
      const doc = c as Record<string, unknown>;
      return s + Number(doc.suCredit ?? doc.su_credit ?? 0);
    }, 0);
  }

  private matchesCategory(
    category: string,
    course: Record<string, unknown>,
    req?: CategoryReq,
    requiredCourseSet: Set<string> = new Set(),
  ) {
    const cats = (course.categories as Record<string, unknown>) ?? {};
    const elType = String(course.elType ?? '').toLowerCase();
    const fullCode = String(course.fullCode ?? '').replace(/\s+/g, '').toUpperCase();
    const ownSet = new Set((req?.courses ?? []).map((c) => c.replace(/\s+/g, '').toUpperCase()));

    if (category === 'required') {
      if (ownSet.size > 0) return ownSet.has(fullCode);
      return elType === 'required';
    }
    if (category === 'core') {
      if (requiredCourseSet.has(fullCode)) return false;
      return elType === 'core' || Boolean(cats.isCore ?? cats.is_core);
    }
    if (category === 'area') return Boolean(cats.isArea ?? cats.is_area);
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
