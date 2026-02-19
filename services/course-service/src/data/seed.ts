/**
 * Seed scripti: data/201901_bio.jsonl dosyasını okur ve MongoDB'ye upsert eder.
 * Çalıştırma: npx ts-node -r tsconfig-paths/register src/data/seed.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/su-advisor';
const JSONL_PATH = path.join(__dirname, '../../data/201901_bio.jsonl');

interface RawCourse {
  Major?: string;
  Code?: string;
  Name?: string;
  ECTS?: number | string;
  SU_Credit?: number | string;
  Faculty?: string;
  EL_Type?: string;
  Engineering?: number | string;
  Basic_Science?: number | string;
  Prerequisites?: string;
  Instructors?: string;
  Description?: string;
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
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function parseInstructors(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function transformRow(row: RawCourse): CourseDoc {
  const major = (row.Major ?? '').trim().toUpperCase();
  const code = (row.Code ?? '').trim();
  const engineering = parseFloat(String(row.Engineering ?? '0')) || 0;
  const basicScience = parseFloat(String(row.Basic_Science ?? '0')) || 0;
  const elType = (row.EL_Type ?? 'university').toLowerCase();

  return {
    major,
    code,
    fullCode: `${major}${code}`,
    name: (row.Name ?? '').trim(),
    ects: parseInt(String(row.ECTS ?? '0'), 10) || 0,
    suCredit: parseFloat(String(row.SU_Credit ?? '0')) || 0,
    faculty: (row.Faculty ?? '').trim().toUpperCase(),
    elType,
    categories: {
      engineering,
      basicScience,
      isCore: elType === 'faculty' && engineering >= 3,
      isArea: elType === 'area',
      isBasicScience: basicScience > 0,
    },
    prerequisites: parsePrerequisites(row.Prerequisites),
    instructors: parseInstructors(row.Instructors),
    description: (row.Description ?? '').trim(),
  };
}

async function seed() {
  if (!fs.existsSync(JSONL_PATH)) {
    console.warn(`JSONL dosyası bulunamadı: ${JSONL_PATH}`);
    console.warn('Seed atlandı. Dosyayı data/ klasörüne ekleyip tekrar çalıştırın.');
    process.exit(0);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB bağlantısı kuruldu.');

  const CourseSchema = new mongoose.Schema({}, { strict: false, collection: 'courses' });
  const CourseModel =
    mongoose.models['Course'] ?? mongoose.model('Course', CourseSchema);

  const rl = readline.createInterface({
    input: fs.createReadStream(JSONL_PATH),
    crlfDelay: Infinity,
  });

  const batch: CourseDoc[] = [];
  let total = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw = JSON.parse(trimmed) as RawCourse;
      batch.push(transformRow(raw));
    } catch {
      console.warn('JSON parse hatası, satır atlandı.');
    }

    if (batch.length >= 100) {
      await bulkUpsert(CourseModel, batch);
      total += batch.length;
      console.log(`${total} ders işlendi...`);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    await bulkUpsert(CourseModel, batch);
    total += batch.length;
  }

  console.log(`Seed tamamlandı. Toplam ${total} ders eklendi/güncellendi.`);
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
