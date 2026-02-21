import { Injectable, NotFoundException } from '@nestjs/common';
import { CoursesRepository } from './courses.repository';
import { CourseDocument } from './schemas/course.schema';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

type PlainCourse = Record<string, unknown>;

@Injectable()
export class CoursesService {
  private fallbackReady = false;
  private fallbackCourses = new Map<string, PlainCourse>();
  private fallbackByMajor = new Map<string, PlainCourse[]>();
  private basicCredits = new Map<string, { engineering: number; basicScience: number }>();
  private fallbackInstructors = new Map<string, string[]>();

  constructor(private readonly repo: CoursesRepository) {}

  async getCourse(fullCode: string): Promise<CourseDocument> {
    const code = fullCode.toUpperCase();
    const course = await this.repo.findByFullCode(code);
    if (course) return course;

    await this.ensureFallbackLoaded();
    const fb = this.fallbackCourses.get(code);
    if (!fb) throw new NotFoundException(`Ders bulunamadı: ${fullCode}`);
    return fb as unknown as CourseDocument;
  }

  async searchCourses(
    query: string,
    major?: string,
    faculty?: string,
    elType?: string,
    page = 1,
    pageSize = 20,
  ) {
    const dbResult = await this.repo.search(query, major, faculty, elType, page, pageSize);
    if (dbResult.total > 0) return dbResult;

    await this.ensureFallbackLoaded();
    const q = (query ?? '').trim().toUpperCase();
    const majorFilter = (major ?? '').trim().toUpperCase();
    const facultyFilter = (faculty ?? '').trim().toUpperCase();
    const elTypeFilter = (elType ?? '').trim().toLowerCase();

    let list = Array.from(this.fallbackCourses.values());

    if (q) {
      const qNoSpace = q.replace(/\s+/g, '');
      list = list.filter((c) => {
        const fullCode = String(c.fullCode ?? '').toUpperCase();
        const name = String(c.name ?? '').toUpperCase();
        const desc = String(c.description ?? '').toUpperCase();
        return fullCode.includes(qNoSpace) || name.includes(q) || desc.includes(q);
      });
    }
    if (majorFilter) list = list.filter((c) => String(c.major ?? '').toUpperCase() === majorFilter);
    if (facultyFilter) list = list.filter((c) => String(c.faculty ?? '').toUpperCase() === facultyFilter);
    if (elTypeFilter) list = list.filter((c) => String(c.elType ?? '').toLowerCase() === elTypeFilter);

    list.sort((a, b) => String(a.fullCode).localeCompare(String(b.fullCode)));
    const total = list.length;
    const skip = Math.max(0, (page - 1) * pageSize);
    const courses = list.slice(skip, skip + pageSize) as unknown as CourseDocument[];
    return { courses, total };
  }

  async findByCodes(codes: string[]): Promise<CourseDocument[]> {
    const dbCourses = await this.repo.findByCodes(codes);
    const have = new Set(dbCourses.map((c) => String((c as unknown as Record<string, unknown>).fullCode ?? '').toUpperCase()));
    const missing = codes.map((c) => c.toUpperCase()).filter((c) => !have.has(c));
    if (missing.length === 0) return dbCourses;

    await this.ensureFallbackLoaded();
    const fallback = missing
      .map((c) => this.fallbackCourses.get(c))
      .filter(Boolean) as PlainCourse[];

    return [...dbCourses, ...(fallback as unknown as CourseDocument[])];
  }

  async findByMajor(major: string): Promise<CourseDocument[]> {
    const dbCourses = await this.repo.findByMajor(major);
    if (dbCourses.length > 0) return dbCourses;

    await this.ensureFallbackLoaded();
    const key = major.toUpperCase();
    const list = this.fallbackByMajor.get(key) ?? [];
    return list as unknown as CourseDocument[];
  }

  // gRPC response mapper
  mapToProto(course: CourseDocument) {
    const doc = course as unknown as Record<string, unknown>;
    const cats = (doc.categories as Record<string, unknown>) ?? {};
    return {
      id: String(doc._id ?? doc.fullCode ?? ''),
      major: doc.major,
      code: doc.code,
      fullCode: doc.fullCode,
      name: doc.name,
      ects: doc.ects,
      suCredit: doc.suCredit,
      faculty: doc.faculty,
      elType: doc.elType,
      categories: {
        engineering: cats.engineering ?? 0,
        basicScience: cats.basicScience ?? 0,
        isCore: cats.isCore ?? false,
        isArea: cats.isArea ?? false,
        isBasicScience: cats.isBasicScience ?? false,
      },
      prerequisites: (doc.prerequisites as string[]) ?? [],
      instructors: (doc.instructors as string[]) ?? [],
      description: doc.description ?? '',
    };
  }

  private async ensureFallbackLoaded() {
    if (this.fallbackReady) return;
    this.fallbackReady = true;

    const dataRoot = path.join(__dirname, '../../data');
    const coursePath = path.join(dataRoot, 'all_coursepage_info.jsonl');
    const basicPath = path.join(dataRoot, 'basic_science_credits.jsonl');
    const schedulePath = path.join(dataRoot, 'schedule/202502.jsonl');

    await this.loadBasicCredits(basicPath);
    await this.loadFallbackInstructors(schedulePath);
    await this.loadCourseCatalog(coursePath);
  }

  private async loadBasicCredits(filePath: string) {
    if (!fs.existsSync(filePath)) return;
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as { course_id?: string; engineering?: number; basic_science?: number };
        const code = String(row.course_id ?? '').toUpperCase();
        if (!code) continue;
        this.basicCredits.set(code, {
          engineering: Number(row.engineering ?? 0),
          basicScience: Number(row.basic_science ?? 0),
        });
      } catch {
        // ignore broken line
      }
    }
  }

  private async loadFallbackInstructors(filePath: string) {
    if (!fs.existsSync(filePath)) return;
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as { course_id?: string; meetings?: Array<{ instructors?: string }> };
        const code = String(row.course_id ?? '').toUpperCase();
        if (!code) continue;
        const names = (row.meetings ?? [])
          .map((m) => String(m.instructors ?? '').replace(/\(\s*P\s*\)/g, '').trim())
          .filter((x) => x.length > 0);
        if (names.length === 0) continue;
        const merged = Array.from(new Set([...(this.fallbackInstructors.get(code) ?? []), ...names])).slice(0, 8);
        this.fallbackInstructors.set(code, merged);
      } catch {
        // ignore broken line
      }
    }
  }

  private async loadCourseCatalog(filePath: string) {
    if (!fs.existsSync(filePath)) return;
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as {
          course_id?: string;
          subj_code?: string;
          crse_numb?: string;
          title?: string;
          header_text?: string;
          su_credits?: number;
          ects?: number;
          description?: string;
          prerequisites?: string;
          scrape_ok?: boolean;
        };
        const fullCode = String(row.course_id ?? '').toUpperCase();
        if (!fullCode || row.scrape_ok === false) continue;
        const major = String(row.subj_code ?? '').toUpperCase();
        const code = String(row.crse_numb ?? '');
        if (!major || !code) continue;

        const basic = this.basicCredits.get(fullCode) ?? { engineering: 0, basicScience: 0 };
        const level = parseInt(code, 10) || 0;
        const nameFromHeader = String(row.header_text ?? '')
          .replace(/^[A-ZÇĞİÖŞÜ]{2,6}\s*\d{3,5}[A-Z]?\s*/i, '')
          .trim();
        const name = String(row.title ?? '').trim() || nameFromHeader || fullCode;

        const isCore = level >= 200 && ['CS', 'EE', 'ME', 'IE', 'BIO', 'MAT', 'MATH', 'DSA', 'ENS'].includes(major);
        const isArea = level >= 300;
        const isBasicScience = basic.basicScience > 0;
        const elType = this.guessElType(major, level, isArea);

        const course: PlainCourse = {
          _id: fullCode,
          major,
          code,
          fullCode,
          name,
          ects: Number(row.ects ?? 0),
          suCredit: Number(row.su_credits ?? 0),
          faculty: '',
          elType,
          categories: {
            engineering: basic.engineering,
            basicScience: basic.basicScience,
            isCore,
            isArea,
            isBasicScience,
          },
          prerequisites: this.parsePrereq(String(row.prerequisites ?? '')),
          instructors: this.fallbackInstructors.get(fullCode) ?? [],
          description: String(row.description ?? ''),
        };

        this.fallbackCourses.set(fullCode, course);
        if (!this.fallbackByMajor.has(major)) this.fallbackByMajor.set(major, []);
        this.fallbackByMajor.get(major)!.push(course);
      } catch {
        // ignore broken line
      }
    }
  }

  private parsePrereq(raw: string) {
    if (!raw) return [];
    const matches = raw.toUpperCase().match(/[A-Z]{2,6}\s*\d{3,5}[A-Z]?/g) ?? [];
    return Array.from(new Set(matches.map((m) => m.replace(/\s+/g, ''))));
  }

  private guessElType(major: string, level: number, isArea: boolean) {
    if (major === 'IF' || major === 'SPS' || major === 'HUM' || major === 'TLL' || major === 'HIST' || major === 'AL') {
      return 'university';
    }
    if (isArea) return 'area';
    if (level >= 200) return 'core';
    return 'free';
  }
}
