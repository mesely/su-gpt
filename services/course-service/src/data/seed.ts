/**
 * Seed scripti: data/ klasöründeki tüm .jsonl dosyalarını okur ve MongoDB'ye upsert eder.
 * Klasör yapısı: data/201901/BIO.jsonl, data/201901/CS.jsonl, vb.
 * Çalıştırma: npx ts-node -r tsconfig-paths/register src/data/seed.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/su-advisor';

// data/ klasörü: seed.ts → ../../data (dist/data/seed.js → ../../data = /app/data)
const DATA_DIR = path.join(__dirname, '../../data');

interface RawCourse {
  Major?: string;
  Code?: string;
  Course_Name?: string;  // actual field name in JSONL
  Name?: string;         // fallback
  ECTS?: number | string;
  SU_credit?: number | string;  // actual field name in JSONL
  SU_Credit?: number | string;  // fallback
  Faculty?: string;
  EL_Type?: string;
  Engineering?: number | string;
  Basic_Science?: number | string;
  Prerequisites?: string;
  Prerequisite?: string;
  Instructors?: string;
  Instructor?: string;
  Description?: string;
}

interface CoursePageRow {
  course_id?: string;          // e.g. "AL102"
  subj_code?: string;          // e.g. "AL"
  crse_numb?: string;          // e.g. "102"
  title?: string;
  su_credits?: number | string;
  ects?: number | string;
  engineering?: number | string | null;
  basic_science?: number | string | null;
  description?: string | null;
  prerequisites?: string | null;
}

interface CourseDoc {
  major: string;
  code: string;
  fullCode: string;
  name: string;
  ects: number;
  suCredit: number;
  faculty: string;
  elType: string;
  categories: {
    engineering: number;
    basicScience: number;
    isCore: boolean;
    isArea: boolean;
    isBasicScience: boolean;
  };
  prerequisites: string[];
  instructors: string[];
  description: string;
}

function parsePrerequisites(raw: string | undefined): string[] {
  if (!raw) return [];
  const compact = raw.toUpperCase();
  const matches = compact.match(/[A-Z]{2,5}\s*\d{3}[A-Z]?/g) ?? [];
  if (matches.length > 0) {
    return Array.from(new Set(matches.map((m) => m.replace(/\s+/g, ''))));
  }
  return compact.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
}

function parseInstructors(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fromLegacyRow(row: RawCourse): CourseDoc | null {
  const major = (row.Major ?? '').trim().toUpperCase();
  const code = (row.Code ?? '').trim();
  if (!major || !code) return null;
  const engineering = parseFloat(String(row.Engineering ?? '0')) || 0;
  const basicScience = parseFloat(String(row.Basic_Science ?? '0')) || 0;
  const elType = (row.EL_Type ?? 'university').toLowerCase();

  return {
    major,
    code,
    fullCode: `${major}${code}`,
    name: (row.Course_Name ?? row.Name ?? '').trim(),
    ects: parseInt(String(row.ECTS ?? '0'), 10) || 0,
    suCredit: parseFloat(String(row.SU_credit ?? row.SU_Credit ?? '0')) || 0,
    faculty: (row.Faculty ?? '').trim().toUpperCase(),
    elType,
    categories: {
      engineering,
      basicScience,
      isCore: elType === 'faculty' && engineering >= 3,
      isArea: elType === 'area',
      isBasicScience: basicScience > 0,
    },
    prerequisites: parsePrerequisites(row.Prerequisites ?? row.Prerequisite),
    instructors: parseInstructors(row.Instructors ?? row.Instructor),
    description: (row.Description ?? '').trim(),
  };
}

function fromCoursePageRow(row: CoursePageRow): CourseDoc | null {
  const subj = (row.subj_code ?? '').trim().toUpperCase();
  const numb = (row.crse_numb ?? '').trim();
  const courseId = (row.course_id ?? '').trim().toUpperCase();
  const full = courseId || `${subj}${numb}`;
  if (!full || !subj || !numb) return null;

  const engineering = parseFloat(String(row.engineering ?? '0')) || 0;
  const basicScience = parseFloat(String(row.basic_science ?? '0')) || 0;
  const title = (row.title ?? '').trim();
  const description = (row.description ?? '').trim();

  const isCore = full.startsWith('CS') || full.startsWith('IF') || full.startsWith('EE') || full.startsWith('ME') || full.startsWith('IE');
  const isBasic = basicScience > 0 || full.startsWith('MATH') || full.startsWith('PHYS') || full.startsWith('NS');
  const isArea = ['CS4', 'CS5', 'EE4', 'ME4', 'IE4'].some((p) => full.startsWith(p));

  return {
    major: subj,
    code: numb,
    fullCode: full,
    name: title || full,
    ects: parseFloat(String(row.ects ?? '0')) || 0,
    suCredit: parseFloat(String(row.su_credits ?? '0')) || 0,
    faculty: '',
    elType: isArea ? 'area' : isCore ? 'faculty' : 'university',
    categories: {
      engineering,
      basicScience,
      isCore,
      isArea,
      isBasicScience: isBasic,
    },
    prerequisites: parsePrerequisites(row.prerequisites ?? undefined),
    instructors: [],
    description,
  };
}

function transformRow(raw: RawCourse | CoursePageRow): CourseDoc | null {
  const legacy = fromLegacyRow(raw as RawCourse);
  if (legacy) return legacy;
  return fromCoursePageRow(raw as CoursePageRow);
}

/** data/ altındaki tüm .jsonl dosyalarını döndürür (recursive) */
function collectJsonlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsonlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function processFile(
  filePath: string,
  model: mongoose.Model<mongoose.Document>,
): Promise<number> {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  const batch: CourseDoc[] = [];
  let total = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw = JSON.parse(trimmed) as RawCourse | CoursePageRow;
      const transformed = transformRow(raw);
      if (transformed) batch.push(transformed);
    } catch {
      console.warn(`JSON parse hatası atlandı: ${path.basename(filePath)}`);
    }

    if (batch.length >= 100) {
      await bulkUpsert(model, batch);
      total += batch.length;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    await bulkUpsert(model, batch);
    total += batch.length;
  }

  return total;
}

async function seed() {
  const files = collectJsonlFiles(DATA_DIR);

  if (files.length === 0) {
    console.warn(`Hiç .jsonl dosyası bulunamadı: ${DATA_DIR}`);
    console.warn(
      'data/ klasörüne dönemsel klasörler ekleyin (örn: data/201901/CS.jsonl)',
    );
    process.exit(0);
  }

  console.log(`${files.length} adet .jsonl dosyası bulundu.`);

  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB bağlantısı kuruldu.');

  const CourseSchema = new mongoose.Schema({}, { strict: false, collection: 'courses' });
  const CourseModel =
    mongoose.models['Course'] ?? mongoose.model('Course', CourseSchema);

  let grandTotal = 0;

  for (const filePath of files) {
    const rel = path.relative(DATA_DIR, filePath);
    process.stdout.write(`  ${rel} işleniyor... `);
    const count = await processFile(filePath, CourseModel);
    grandTotal += count;
    console.log(`${count} ders`);
  }

  console.log(`\nSeed tamamlandı. Toplam ${grandTotal} ders eklendi/güncellendi.`);
  await mongoose.disconnect();
}

async function bulkUpsert(
  model: mongoose.Model<mongoose.Document>,
  docs: CourseDoc[],
) {
  const ops = docs.map((d) => ({
    updateOne: {
      filter: { fullCode: d.fullCode },
      update: { $set: d },
      upsert: true,
    },
  }));
  await model.bulkWrite(ops);
}

seed().catch((err) => {
  console.error('Seed hatası:', err);
  process.exit(1);
});
