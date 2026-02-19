# CLAUDE.md — SU Advisor
**Sabancı Üniversitesi Yapay Zeka Destekli Ders & Mezuniyet Planlama Asistanı**

> Bu dosyayı okuyan her Claude oturumu önce bu dosyayı baştan sona okusun, sonra koda dokunsun.

---

## 0. Proje Vizyonu

SU Advisor, Sabancı Üniversitesi öğrencilerine şunları sunar:

1. **Akıllı ders planlama** — hangi dersi ne zaman almalı, önkoşullar, ECTS yükü
2. **Mezuniyet takibi** — core/area/basic-science kredilerini otomatik hesapla, eksiği göster
3. **Hoca yorumları** — WhatsApp gruplarından yüklenen anonymized yorumları RAG ile sun
4. **Kariyer path önerisi** — NLP / CV / Controller / Systems path'leri için tavsiye
5. **Geçmiş sınav arşivi** — PDF canvas olarak öğrenciye sun

---

## 1. Monorepo Yapısı

```
su-advisor/
├── CLAUDE.md                    ← BU DOSYA
├── docker-compose.yml
├── .env.example
│
├── gateway/                     ← HTTP API Gateway (NestJS, port 3000)
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── auth/                ← JWT guard, SU SSO mock
│   │   ├── proxy/               ← gRPC client proxy'leri
│   │   └── middleware/          ← rate-limit, cors, helmet
│   └── proto/                   ← .proto dosyaları (shared symlink)
│
├── services/
│   ├── course-service/          ← Ders kataloğu + müfredat (NestJS + gRPC, port 50051)
│   │   ├── src/
│   │   │   ├── courses/
│   │   │   │   ├── courses.controller.ts   ← gRPC handler
│   │   │   │   ├── courses.service.ts
│   │   │   │   └── courses.repository.ts  ← MongoDB
│   │   │   └── graduation/
│   │   │       ├── graduation.service.ts  ← kredi hesaplama motoru
│   │   │       └── path.service.ts        ← kariyer path analizi
│   │   └── data/
│   │       ├── 201901_bio.jsonl           ← ham ders verisi
│   │       ├── graduation_requirements.json
│   │       └── seed.ts
│   │
│   ├── rag-service/             ← LLM + RAG motoru (NestJS + gRPC, port 50052)
│   │   ├── src/
│   │   │   ├── rag/
│   │   │   │   ├── rag.controller.ts
│   │   │   │   ├── rag.service.ts         ← Mistral API çağrısı
│   │   │   │   ├── vector.service.ts      ← Chroma / pgvector
│   │   │   │   ├── prompt-builder.ts      ← Few-shot prompt fabrikası
│   │   │   │   └── chain-of-thought.ts    ← CoT wrapper
│   │   │   └── ingestion/
│   │   │       ├── whatsapp.parser.ts
│   │   │       └── exam.ingestor.ts
│   │   └── prompts/             ← .txt prompt şablonları
│   │       ├── course_qa.txt
│   │       ├── graduation_check.txt
│   │       ├── instructor_review.txt
│   │       └── path_advisor.txt
│   │
│   ├── instructor-service/      ← Hoca yorumları (NestJS + gRPC, port 50053)
│   │   └── src/
│   │       ├── reviews/
│   │       │   ├── reviews.controller.ts
│   │       │   ├── reviews.service.ts
│   │       │   └── sentiment.service.ts   ← pozitif/negatif yorum sayısı
│   │       └── admin/
│   │           └── upload.controller.ts   ← WhatsApp .txt yükleme endpoint
│   │
│   └── exam-service/            ← Sınav arşivi (NestJS + gRPC, port 50054)
│       └── src/
│           ├── exams/
│           │   ├── exams.controller.ts
│           │   └── exams.service.ts       ← PDF metadata + MinIO presigned URL
│           └── upload/
│               └── exam-upload.controller.ts
│
├── proto/                       ← Tüm .proto dosyaları tek yerde
│   ├── course.proto
│   ├── rag.proto
│   ├── instructor.proto
│   └── exam.proto
│
├── frontend/                    ← Next.js 14 App Router (port 3001)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             ← Ana sayfa / chat
│   │   ├── plan/page.tsx        ← Dönem planlama tablosu
│   │   ├── graduation/page.tsx  ← Mezuniyet kontrol paneli
│   │   ├── exams/page.tsx       ← Sınav arşivi
│   │   └── admin/page.tsx       ← WhatsApp + sınav yükleme paneli
│   ├── components/
│   │   ├── ui/                  ← Glassmorphism bileşen kütüphanesi
│   │   │   ├── GlassCard.tsx
│   │   │   ├── GlassModal.tsx
│   │   │   └── GlassBadge.tsx
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx
│   │   │   └── MessageBubble.tsx
│   │   ├── plan/
│   │   │   ├── SemesterTable.tsx
│   │   │   └── CourseCard.tsx
│   │   ├── graduation/
│   │   │   ├── RequirementGrid.tsx
│   │   │   └── ProgressRing.tsx
│   │   └── instructor/
│   │       └── ReviewCard.tsx
│   └── styles/
│       └── su-theme.css         ← Sabancı mavi design token'ları
│
└── infra/
    ├── docker/
    ├── nginx/
    └── scripts/
        ├── seed-courses.sh
        └── ingest-whatsapp.sh
```

---

## 2. Tech Stack

| Katman | Teknoloji | Versiyon |
|---|---|---|
| Frontend | Next.js App Router | 14.x |
| Frontend state | Zustand | 5.x |
| Frontend UI | Tailwind CSS + custom glassmorphism | 3.x |
| Animasyon | Framer Motion | 11.x |
| Backend framework | NestJS | 10.x |
| Servisler arası | gRPC (protobuf) | — |
| Dış API | HTTP (gateway → client) | — |
| Veritabanı | MongoDB (courses, reviews) | 7.x |
| Vector DB | ChromaDB (self-hosted) | 0.5.x |
| Object storage | MinIO (PDF'ler) | latest |
| LLM | Mistral API (mistral-small-latest) | — |
| Embedding | Mistral embed (mistral-embed) | — |
| Auth | JWT + mock SU SSO | — |
| Container | Docker Compose | — |

---

## 3. Veri Modelleri

### 3.1 Course (MongoDB)

```typescript
interface Course {
  _id: string;
  major: string;           // "IF", "CS", "EE" ...
  code: string;            // "100", "201" ...
  fullCode: string;        // "IF100"
  name: string;
  ects: number;
  suCredit: number;
  faculty: string;         // "FENS", "FASS" ...
  elType: string;          // "university", "faculty", "area"
  categories: {
    engineering: number;   // 0-5 ağırlık
    basicScience: number;
    isCore: boolean;
    isArea: boolean;
    isBasicScience: boolean;
  };
  prerequisites: string[]; // ["IF100", "MATH101"]
  instructors: string[];
  description?: string;
}
```

### 3.2 GraduationRequirement (JSON dosyası, seed ile yüklenir)

```json
{
  "major": "CS",
  "totalEcts": 240,
  "categories": {
    "core": { "minEcts": 90, "courses": ["CS201", "CS301"] },
    "area": { "minEcts": 45, "pools": ["NLP_PATH", "CV_PATH", "SYSTEMS_PATH"] },
    "basicScience": { "minEcts": 30 },
    "university": { "minEcts": 18 },
    "free": { "minEcts": 20 }
  },
  "paths": {
    "NLP_PATH": {
      "name": "Natural Language Processing",
      "requiredCourses": ["CS412", "CS464", "CS514"],
      "electivePick": { "count": 2, "from": ["CS461", "CS562"] }
    },
    "CV_PATH": {
      "name": "Computer Vision",
      "requiredCourses": ["CS484", "CS585"],
      "electivePick": { "count": 2, "from": ["CS489", "CS580"] }
    },
    "CONTROLLER_PATH": {
      "name": "Systems & Control",
      "requiredCourses": ["EE361", "EE462"],
      "electivePick": { "count": 2, "from": ["EE465", "EE560"] }
    }
  }
}
```

### 3.3 InstructorReview (MongoDB)

```typescript
interface InstructorReview {
  _id: string;
  instructorName: string;       // normalize edilmiş: "Ercan Solak"
  courseCode: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  anonymizedText: string;       // PII temizlenmiş yorum
  source: 'whatsapp';
  uploadBatch: string;          // admin upload ID'si
  createdAt: Date;
}

interface InstructorSummary {
  instructorName: string;
  courseCode: string;
  positiveCount: number;
  negativeCount: number;
  topPositiveKeywords: string[];
  topNegativeKeywords: string[];
  recommendation: string;       // RAG ile üretilen 1 cümle özet
}
```

### 3.4 Exam (MongoDB metadata + MinIO)

```typescript
interface Exam {
  _id: string;
  courseCode: string;
  year: number;
  semester: 'fall' | 'spring' | 'summer';
  type: 'midterm' | 'final' | 'quiz';
  fileName: string;
  minioKey: string;             // MinIO object path
  presignedUrl?: string;        // runtime'da üretilir, 1 saat TTL
  uploadedBy: string;
  createdAt: Date;
}
```

---

## 4. gRPC Contract'ları (proto özeti)

### course.proto

```protobuf
service CourseService {
  rpc GetCourse (CourseRequest) returns (CourseResponse);
  rpc SearchCourses (SearchRequest) returns (CourseListResponse);
  rpc GetGraduationStatus (StudentRequest) returns (GraduationStatus);
  rpc GetPathRecommendation (StudentRequest) returns (PathRecommendation);
  rpc GetSemesterPlan (SemesterPlanRequest) returns (SemesterPlan);
}
```

### rag.proto

```protobuf
service RagService {
  rpc Ask (RagRequest) returns (RagResponse);           // streaming
  rpc IngestDocument (IngestRequest) returns (IngestResponse);
  rpc GetSimilarChunks (EmbedRequest) returns (ChunkList);
}
```

### instructor.proto

```protobuf
service InstructorService {
  rpc GetInstructorSummary (InstructorRequest) returns (InstructorSummary);
  rpc UploadWhatsappBatch (UploadRequest) returns (UploadResponse);
  rpc ListInstructors (ListRequest) returns (InstructorList);
}
```

### exam.proto

```protobuf
service ExamService {
  rpc GetExams (ExamFilter) returns (ExamList);
  rpc GetPresignedUrl (ExamRequest) returns (PresignedResponse);
  rpc UploadExam (UploadExamRequest) returns (ExamResponse);
}
```

---

## 5. RAG Pipeline — Detaylı Mimari

### 5.1 Chunking Stratejisi

```
WhatsApp .txt export
    ↓
whatsapp.parser.ts
  - Tarih/saat regex ile mesajları ayır
  - Hoca adı extraction (NER: "Ercan hoca", "Erkay hocadan", vb.)
  - Kurs kodu extraction ("CS301", "Otomata")
  - PII temizleme (isim, telefon, link sil)
  - Chunk boyutu: 200-400 token, overlap 50 token
    ↓
Mistral embed API (mistral-embed)
    ↓
ChromaDB collection: "su_reviews"
  - metadata: { instructor, courseCode, sentiment, batch }
```

### 5.2 Retrieval Chain

```
Kullanıcı sorusu
    ↓
[Query Expansion] — LLM ile 3 alternatif query üret
    ↓
[Embedding] — mistral-embed ile soruyu vektörleştir
    ↓
[Hybrid Search] — ChromaDB'de cosine similarity + metadata filter
  top_k = 8 chunk
    ↓
[Reranking] — Cross-encoder skorla, top 4 seç
    ↓
[Prompt Builder] — prompt-builder.ts
    ↓
[Mistral API] — mistral-small-latest
    ↓
[Response]
```

### 5.3 Prompt Şablonları

**course_qa.txt** (Ders soruları için)

```
Sen Sabancı Üniversitesi'nin resmi ders danışmanısın. Aşağıdaki bağlam bilgilerini
kullanarak öğrencinin sorusunu yanıtla. Bağlamda cevap yoksa "Bu konuda kesin bilgim
yok, danışmanınla görüş" de. Türkçe cevap ver. Emoji kullanma. Maksimum 3 paragraf.

BAĞLAM:
{context}

ÖĞRENCİ GEÇMİŞİ:
Tamamlanan dersler: {completed_courses}
Aktif dönem: {current_semester}
Major: {major}

SORU: {question}

YANITLA (Chain of Thought):
1. Önce soruyu analiz et
2. İlgili ders/kredi bilgilerini çek
3. Öğrencinin durumuna özel öner
```

**instructor_review.txt** (Hoca yorumları için)

```
Sen öğrenci yorumlarını analiz eden bir asistansın. Aşağıdaki yorumlara dayanarak
hoca hakkında TARAFSIZ bir özet sun. Kişisel bilgi (isim hariç) paylaşma.

YORUMLAR (anonymized):
{review_chunks}

ÖZET FORMAT:
- Genel kanı: [olumlu/karışık/olumsuz]
- Olumlu vurgular: (max 3 madde)
- Dikkat edilmesi gerekenler: (max 2 madde)
- Öneri: [bu dersi bu hocadan al / alternatif hocaya bak]
```

**graduation_check.txt** (Mezuniyet kontrolü için)

```
Öğrencinin mezuniyet durumunu analiz et ve eksikleri listele.

ÖĞRENCİ BİLGİSİ:
Major: {major}
Tamamlanan dersler ve ECTS: {completed}
Aktif dönem: {semester}

MEZUNİYET GEREKSİNİMLERİ:
{requirements}

DÜŞÜN:
1. Her kategori için tamamlanan ECTS'i say
2. Eksik ECTS'i hesapla
3. Hangi derslerin alınması gerektiğini önceliklendir
4. Kaç dönem daha gerektiğini tahmin et

ÇIKTI: JSON formatında döndür.
```

### 5.4 Few-Shot Örnek Havuzu

`prompts/few_shots/` klasörüne şu Q&A çiftlerini ekle:

- `"IF100'ü geçemiyorum ne yapayım?"` → CoT ile önce prerequisite zinciri analiz
- `"NLP path için hangi dersleri almalıyım?"` → path requirements + tamamlananları karşılaştır
- `"Ercan hocadan CS412 almalı mıyım?"` → review aggregation + sentiment özet

---

## 6. Frontend Tasarım Sistemi

### 6.1 Sabancı Renk Paleti (su-theme.css)

```css
:root {
  /* Ana renkler — Sabancı kurumsal mavi */
  --su-blue-900: #002147;    /* nav, header bg */
  --su-blue-700: #003d7a;    /* primary buton */
  --su-blue-500: #0057A8;    /* accent, link */
  --su-blue-300: #4d9de0;    /* hover, badge */
  --su-blue-100: #dbeeff;    /* soft bg, chip */
  --su-blue-50:  #f0f7ff;    /* card bg */

  /* Glassmorphism token'ları */
  --glass-bg: rgba(255, 255, 255, 0.08);
  --glass-border: rgba(255, 255, 255, 0.18);
  --glass-blur: blur(24px);
  --glass-shadow: 0 8px 32px rgba(0, 33, 71, 0.18);

  /* Durum renkleri */
  --color-success: #10b981;   /* tamamlandı */
  --color-warning: #f59e0b;   /* devam ediyor */
  --color-danger:  #ef4444;   /* eksik */
  --color-neutral: #64748b;   /* pasif */
}
```

### 6.2 GlassCard Bileşeni (Tüm kartlar bu pattern'i kullanır)

```tsx
// components/ui/GlassCard.tsx
export const GlassCard = ({ children, className }: GlassCardProps) => (
  <div className={cn(
    "bg-white/8 backdrop-blur-2xl",
    "border border-white/18",
    "rounded-[28px] shadow-[0_8px_32px_rgba(0,33,71,0.18)]",
    "p-5 transition-all duration-300",
    "hover:bg-white/12 hover:shadow-[0_12px_40px_rgba(0,33,71,0.25)]",
    className
  )}>
    {children}
  </div>
);
```

### 6.3 Sayfa Layoutları

**Dönem Planlama Tablosu (/plan)**

```
┌─────────────────────────────────────────────────────┐
│  HEADER: "2024-2025 Güz" | ECTS toplam | Kredi bar  │
├──────────┬──────────┬──────────┬──────────┬──────────┤
│  Dönem 1 │  Dönem 2 │  Dönem 3 │  Dönem 4 │  Dönem 5 │
├──────────┼──────────┼──────────┼──────────┼──────────┤
│ GlassCard│ GlassCard│ GlassCard│          │          │
│ IF100    │ CS201    │ CS301    │  [+ Ekle]│  [+ Ekle]│
│ 5 ECTS   │ 3 ECTS   │ 4 ECTS   │          │          │
│ [Core]   │ [Area]   │ [BS]     │          │          │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

Her ders kartı: `kod | isim | ECTS | kategori badge | hoca yorumu skoru (⭐ veya ⚠️)`

**Mezuniyet Kontrol Paneli (/graduation)**

- Sol: ProgressRing bileşenleri (Core / Area / BS / Free / Total ECTS)
- Sağ: Eksik dersler listesi, path completion yüzdesi
- Alt: Path seçici (NLP / CV / Controller / Systems)

**Chat (/)**

- Sağ: Chat window, streaming response
- Sol (sidebar): Hızlı aksiyonlar
  - "Mezuniyet durumum nedir?"
  - "Bu dönem ne almalıyım?"
  - "Ercan hocayı ara"
  - "CS412 hakkında geçmiş sınavlar"

**Admin Panel (/admin)**

- WhatsApp Upload: Drag & drop .txt dosyası → parse preview → onay → ingest
- Sınav Upload: Ders kodu + dönem seç → PDF yükle → MinIO'ya gider

---

## 7. API Gateway Route'ları

```
GET  /api/v1/courses              → CourseService.SearchCourses
GET  /api/v1/courses/:code        → CourseService.GetCourse
GET  /api/v1/graduation/:studentId → CourseService.GetGraduationStatus
GET  /api/v1/plan/:studentId      → CourseService.GetSemesterPlan
POST /api/v1/plan/:studentId      → ders ekle/çıkar

POST /api/v1/rag/ask              → RagService.Ask (SSE streaming)
GET  /api/v1/rag/similar          → RagService.GetSimilarChunks

GET  /api/v1/instructors/:name    → InstructorService.GetInstructorSummary
POST /api/v1/admin/whatsapp       → InstructorService.UploadWhatsappBatch

GET  /api/v1/exams                → ExamService.GetExams
GET  /api/v1/exams/:id/url        → ExamService.GetPresignedUrl
POST /api/v1/admin/exams          → ExamService.UploadExam
```

---

## 8. Ortam Değişkenleri (.env.example)

```env
# LLM
MISTRAL_API_KEY=your_mistral_key_here
MISTRAL_MODEL=mistral-small-latest
MISTRAL_EMBED_MODEL=mistral-embed
MISTRAL_MAX_TOKENS=2048
MISTRAL_TEMPERATURE=0.3

# Gelecekte eklenecek (şimdilik comment'te):
# OPENAI_API_KEY=
# LLM_PROVIDER=mistral   # mistral | openai | ollama

# MongoDB
MONGODB_URI=mongodb://localhost:27017/su-advisor

# ChromaDB
CHROMA_HOST=localhost
CHROMA_PORT=8000
CHROMA_COLLECTION_REVIEWS=su_reviews
CHROMA_COLLECTION_EXAMS=su_exams

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_EXAMS=exam-pdfs

# gRPC ports
COURSE_SERVICE_PORT=50051
RAG_SERVICE_PORT=50052
INSTRUCTOR_SERVICE_PORT=50053
EXAM_SERVICE_PORT=50054

# Gateway
GATEWAY_PORT=3000
JWT_SECRET=change_me_in_production

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

---

## 9. Başlatma Sırası (docker-compose)

```yaml
services:
  mongodb:        # 27017
  chroma:         # 8000
  minio:          # 9000, 9001 (console)
  course-svc:     # depends_on: mongodb  → 50051
  rag-svc:        # depends_on: mongodb, chroma → 50052
  instructor-svc: # depends_on: mongodb → 50053
  exam-svc:       # depends_on: mongodb, minio → 50054
  gateway:        # depends_on: tüm servisler → 3000
  frontend:       # depends_on: gateway → 3001
```

Seed komutu: `docker exec course-svc npx ts-node src/data/seed.ts`

---

## 10. Seed Scripti Mantığı (course-service/src/data/seed.ts)

```typescript
// 201901_bio.jsonl'i oku
// Her satır için:
//   - fullCode = Major + Code  ("IF" + "100" → "IF100")
//   - categories.isCore      = EL_Type === "faculty" && Engineering >= 3
//   - categories.isArea      = EL_Type === "area"
//   - categories.isBasicScience = Basic_Science > 0
// MongoDB'ye upsert (fullCode unique index)
```

---

## 11. WhatsApp Parser Mantığı

```
Input: .txt export (Android veya iOS format)
Regex: /\[(\d{2}\.\d{2}\.\d{4}), \d{2}:\d{2}:\d{2}\] (.+?): (.+)/

Hoca ismi extraction:
  - "ercan hoca", "erkay'dan", "Yusuf hoca" gibi pattern'lar
  - Bilinen hoca isim listesiyle fuzzy match (Jaro-Winkler)

PII temizleme:
  - Türkiye telefon regex sil
  - URL sil
  - Kalan kişi isimlerini [SİLİNDİ] ile replace

Sentiment:
  - Türkçe basit kural tabanlı (harika/süper → positive, berbat/zor/geçilmez → negative)
  - Mistral ile refinement (batch, rate limit gözetilerek)
```

---

## 12. Geliştirme Kuralları

### Genel

- Her servis kendi `package.json`'ına sahip, workspace root'ta turbo veya npm workspaces kullan
- Tüm servisler TypeScript strict mode ile çalışır
- `.env` asla commit edilmez, `.env.example` her zaman güncel tutulur

### gRPC

- Proto dosyaları `/proto` klasöründe tek yerde tutulur, servisler symlink ile bağlanır
- Her servis başlangıçta `@grpc/proto-loader` ile proto'yu yükler
- gRPC health check her serviste aktif olmalı

### Frontend

- App Router kullan, `pages/` kullanma
- Server Component'lerde veri çek, Client Component'lerde interaktivite ekle
- `"use client"` direktifi sadece gerçekten gerektiğinde kullan
- Tüm glassmorphism kartlar `GlassCard` base bileşenini extend eder
- Sabancı mavisi dışında renk ekleme — durum renkleri (success/warning/danger) hariç
- Modal'lar `createPortal` ile body'e mount edilir

### RAG / LLM

- Prompt şablonları `.txt` dosyalarında, kod içine gömme
- Her prompt sonunda Chain of Thought adımları belirtilmeli
- Mistral rate limit: 1 req/sn (free tier), queue ile yönet
- Embedding'ler cache'lenir: MongoDB'de `embeddingCache` collection'ı

### Admin Panel

- Upload endpoint'leri JWT + `isAdmin: true` claim ile korunur
- WhatsApp batch'i parse sonrası "preview" göster, admin onayladıktan sonra ingest et
- Her batch'e UUID atanır, silinebilir olmalı

---

## 13. Yapılacaklar Sırası (Claude'un takip edeceği implementation sırası)

1. [ ] `/proto` klasörünü oluştur, tüm `.proto` dosyalarını yaz
2. [ ] `docker-compose.yml` yaz (MongoDB, Chroma, MinIO, tüm servisler)
3. [ ] `course-service`: NestJS init → MongoDB bağlantısı → seed scripti → gRPC handler
4. [ ] `gateway`: NestJS init → gRPC client proxy → HTTP route'ları
5. [ ] `rag-service`: Mistral client → ChromaDB entegrasyonu → prompt builder → RAG chain
6. [ ] `instructor-service`: WhatsApp parser → sentiment → gRPC handler → upload endpoint
7. [ ] `exam-service`: MinIO client → presigned URL → upload/list gRPC
8. [ ] `frontend`: Next.js init → design tokens → GlassCard → Chat sayfası → Plan tablosu → Graduation paneli → Admin
9. [ ] `.env.example` tamamla
10. [ ] `README.md` yaz (kurulum adımları)

---

## 14. Bilinen Kısıtlar & Notlar

- **Mistral free tier**: dakikada ~5 istek, `rag-service`'de istek queue'su şart
- **ChromaDB** persistent volume ile çalıştır, yoksa container restart'ta vektörler gider
- **MinIO** exam bucket'ı public yapma, presigned URL kullan (TTL: 3600s)
- **WhatsApp export format** iOS ve Android'de farklı — her ikisi için regex yaz
- **SU SSO** şu an mock JWT ile simüle ediliyor, gerçek entegrasyon sonraki fazda

---

*Son güncelleme: proje init — Claude bu dosyayı her oturumda baştan okumalı.*
