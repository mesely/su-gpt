# SU Advisor

**Sabancı Üniversitesi Yapay Zeka Destekli Ders & Mezuniyet Planlama Asistanı**

---

## Proje Hakkında

SU Advisor, Sabancı Üniversitesi öğrencilerinin ders planlamasını, mezuniyet takibini ve kariyer path seçimini yapay zeka ile kolaylaştıran bir platformdur. Sistemin tüm konuşma akışı gerçek zamanlı (SSE streaming) çalışır; hoca yorumları WhatsApp gruplarından anonim olarak derlenir ve RAG pipeline üzerinden sunulur.

### Neler yapabilirsin?

| Özellik | Açıklama |
|---|---|
| **Akıllı Chat** | "NLP path için hangi dersleri almalıyım?" gibi serbest sorular sor, Mistral AI cevaplar |
| **Mezuniyet Takibi** | Core / Alan / Temel Bilim / Serbest kredi durumunu anlık gör, eksikleri öğren |
| **Dönem Planı** | Tamamladığın derslere göre önümüzdeki dönem için ders önerisi al |
| **Kariyer Path** | NLP · CV · Controller · Systems path'lerinde ne kadar ilerlediğini gör |
| **Hoca Yorumları** | WhatsApp gruplarından toplanan anonim yorumları sentiment analizi ile sun |
| **Sınav Arşivi** | Geçmiş sınavları filtrele, güvenli presigned URL ile PDF indir |
| **Admin Paneli** | WhatsApp .txt yükle → preview → onayla → RAG'a ingest; sınav PDF kaydı ekle |

---

## Mimari

```
┌─────────────┐        ┌──────────────────────────────────────────────┐
│  Next.js 14 │ HTTP   │           API Gateway  :3000                 │
│  :3001      │───────▶│  NestJS · JWT Auth · Rate Limit · CORS       │
└─────────────┘        └──────┬──────────┬───────────┬───────────────┘
                              │ gRPC     │           │           │
                    ┌─────────▼──┐ ┌─────▼──────┐ ┌─▼──────────┐ ┌──▼──────────┐
                    │   course   │ │    rag     │ │ instructor │ │    exam     │
                    │  service   │ │  service   │ │  service   │ │   service   │
                    │  :50051    │ │  :50052    │ │  :50053    │ │   :50054    │
                    └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └──────┬──────┘
                          │             │  │            │               │
                    ┌─────▼──────┐  ┌───▼──▼──┐  ┌─────▼───────────────▼──────┐
                    │  MongoDB   │  │ Chroma  │  │            MinIO            │
                    │  :27017    │  │  :8000  │  │           :9000             │
                    └────────────┘  └─────────┘  └─────────────────────────────┘
```

### Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Frontend | Next.js 14 App Router · Zustand 5 · Tailwind CSS · Framer Motion |
| Backend Gateway | NestJS 10 · JWT Auth · REST → gRPC Proxy |
| Microservices | NestJS 10 · gRPC (protobuf) |
| Veritabanı | MongoDB 7 (ders, yorum, sınav metadata) |
| Vector DB | ChromaDB 0.5 (hoca yorumları ve sınav embed'leri) |
| Object Storage | MinIO (sınav PDF'leri, presigned URL TTL 1 saat) |
| LLM | Mistral API — `mistral-small-latest` (chat + embedding) |

### Servis Sorumlulukları

- **course-service** — Ders kataloğu (MongoDB), mezuniyet hesaplama, semester planlama, kariyer path analizi
- **rag-service** — Query expansion → Mistral embed → ChromaDB hybrid search → rerank → Mistral streaming
- **instructor-service** — WhatsApp parse, PII temizleme, sentiment analizi, batch onay akışı
- **exam-service** — PDF metadata (MongoDB) + MinIO upload/delete + presigned URL üretimi

---

## Yerel Kurulum (Docker)

### Ön Koşullar

Makinende şunların kurulu olması gerekiyor:

```bash
docker --version        # Docker 24+
docker compose version  # Docker Compose v2 (plugin)
git --version
```

> **Not:** Docker'ı `sudo` olmadan çalıştırmak için kullanıcını `docker` grubuna ekle ve terminali yeniden başlat:
> ```bash
> sudo usermod -aG docker $USER
> ```

---

### 1. Repo'yu Klonla

```bash
git clone https://github.com/mesely/su-gpt.git
cd su-gpt
git checkout claude/setup-api-testing-VITr5
```

---

### 2. Ortam Değişkenlerini Ayarla

```bash
cp .env.example .env
```

`.env` dosyasını bir editörle aç ve yalnızca şu satırı doldur:

```env
MISTRAL_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Mistral API key almak için: **https://console.mistral.ai** → API Keys → Create new key
> Ücretsiz tier yeterli; dakikada ~5 istek, sistem bunu otomatik yönetir.

Diğer tüm değerlerin (`MONGODB_URI`, `MINIO_*`, `JWT_SECRET`, vb.) varsayılan değerleri yerel ortam için çalışır — değiştirmene gerek yok.

---

### 3. Docker ile Tüm Sistemi Ayağa Kaldır

```bash
docker compose up -d
```

Bu komut şunları yapar:
- MongoDB, ChromaDB, MinIO container'larını başlatır
- MinIO'da `exam-pdfs` bucket'ını otomatik oluşturur
- 4 microservice'i build edip başlatır
- API Gateway'i ayağa kaldırır
- Next.js frontend'i build edip başlatır

> **İlk çalıştırmada** tüm image'lar build edileceğinden **5-15 dakika** sürebilir. Sonraki başlatmalar çok daha hızlıdır.

Servislerin durumunu kontrol et:

```bash
docker compose ps
```

Beklenen çıktı — tüm servisler `Up` olmalı:

```
NAME                 STATUS          PORTS
su-mongodb           Up              0.0.0.0:27017->27017/tcp
su-chroma            Up              0.0.0.0:8000->8000/tcp
su-minio             Up (healthy)    0.0.0.0:9000->9000/tcp, 0.0.0.0:9001->9001/tcp
su-minio-init        Exited (0)                              ← normal, bucket init bitti
su-course-svc        Up              0.0.0.0:50051->50051/tcp
su-rag-svc           Up              0.0.0.0:50052->50052/tcp
su-instructor-svc    Up              0.0.0.0:50053->50053/tcp
su-exam-svc          Up              0.0.0.0:50054->50054/tcp
su-gateway           Up              0.0.0.0:3000->3000/tcp
su-frontend          Up              0.0.0.0:3001->3001/tcp
```

---

### 4. Ders Veritabanını Seed'le

İlk kurulumda ders kataloğunu MongoDB'ye yükle:

```bash
docker exec su-course-svc npx ts-node src/data/seed.ts
```

> Bu komutu sadece bir kere çalıştırman yeterli. Veri MongoDB volume'unda kalıcı olarak saklanır.

---

### 5. Uygulamayı Aç

| Servis | URL | Açıklama |
|---|---|---|
| **Frontend** | http://localhost:3001 | Ana uygulama |
| **API Gateway** | http://localhost:3000 | REST API |
| **MinIO Console** | http://localhost:9001 | PDF yönetim paneli (minioadmin / minioadmin) |

Tarayıcıda `http://localhost:3001` adresini aç.

**İlk giriş:**
- Öğrenci ID: `student001` (veya istediğin herhangi bir değer)
- Major: `CS`
- Admin girişi: işaretleme (admin özellikleri için işaretle)

---

### 6. Logları İzle

Tüm servislerin logunu gerçek zamanlı görmek için:

```bash
docker compose logs -f
```

Belirli bir servisin logu:

```bash
docker compose logs -f gateway
docker compose logs -f rag-svc
docker compose logs -f course-svc
```

---

### 7. Sadece Backend'i Başlat (Frontend Olmadan)

Frontend build'i atlamak ve sadece API'yi test etmek istersen:

```bash
docker compose up -d \
  mongodb chroma minio minio-init \
  course-svc rag-svc instructor-svc exam-svc \
  gateway
```

Seed'den sonra API'yi doğrula:

```bash
# Token al
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"studentId":"student001","major":"CS","isAdmin":false}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

# Ders ara
curl -s "http://localhost:3000/api/v1/courses?q=algoritma" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

### 8. Tam API Test Suite

Tüm endpointlere otomatik curl testleri atmak için:

```bash
chmod +x infra/scripts/test-api.sh
./infra/scripts/test-api.sh
```

Script şunları test eder: Auth · Courses · Graduation · Plan · Path · RAG/Chat · Instructors · WhatsApp Admin · Exams · Admin
Sonunda `✓ başarılı / ✗ başarısız` sayısını ve exit code'u raporlar.

---

### Sistemi Durdur

```bash
# Servisleri durdur (veriler korunur)
docker compose down

# Servisleri durdur ve tüm verileri sil (temiz başlangıç)
docker compose down -v
```

---

### Sık Karşılaşılan Sorunlar

**`su-rag-svc` sürekli yeniden başlıyor**
→ `.env` dosyasında `MISTRAL_API_KEY` boş kalmış. Geçerli bir key gir ve `docker compose up -d rag-svc` ile yeniden başlat.

**`su-gateway` başlamıyor, "connection refused" hatası**
→ Microservice'lerden biri henüz hazır değil. 30 saniye bekle ve tekrar dene: `docker compose restart gateway`

**`su-minio-init` hatayla çıktı**
→ MinIO henüz ayağa kalkmamıştı. Manuel olarak bucket oluştur:
```bash
docker exec su-minio-init mc alias set local http://minio:9000 minioadmin minioadmin && \
docker exec su-minio-init mc mb --ignore-existing local/exam-pdfs
```

**Seed scripti "Module not found" hatası verdi**
→ `su-course-svc` container'ı henüz tam başlamamış olabilir. 15 saniye bekle ve tekrar çalıştır.

**Port zaten kullanımda**
→ `.env` dosyasından port numaralarını değiştirebilirsin (`GATEWAY_PORT`, `COURSE_SERVICE_PORT`, vb.).
