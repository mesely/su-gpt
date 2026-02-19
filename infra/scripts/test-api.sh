#!/usr/bin/env bash
# =============================================================================
# SU Advisor — API Gateway Curl Test Suite
# Tüm endpointleri sırayla test eder, başarı/hata sayar.
#
# Kullanım:
#   chmod +x infra/scripts/test-api.sh
#   ./infra/scripts/test-api.sh
#
# Ortam değişkenleri (opsiyonel, default değerler var):
#   BASE_URL=http://localhost:3000
#   STUDENT_JWT=<normal kullanıcı token'ı>
#   ADMIN_JWT=<isAdmin:true token'ı>
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
EXAM_ID=""
BATCH_ID=""

# ─── Renkler ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

header() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# check <test_name> <expected_http_code> <actual_http_code> [<response_body>]
check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  local body="${4:-}"

  if [[ "$actual" == "$expected" ]]; then
    echo -e "  ${GREEN}✓${NC} $name  (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $name  (beklenen: HTTP $expected, gelen: HTTP $actual)"
    if [[ -n "$body" ]]; then
      echo -e "    ${YELLOW}Response:${NC} $(echo "$body" | head -c 300)"
    fi
    FAIL=$((FAIL + 1))
  fi
}

# curl_json <method> <path> [extra_curl_args...]
# Returns: "<http_code> <body>" on stdout
curl_j() {
  local method="$1"; shift
  local path="$1";   shift
  local tmp
  tmp=$(mktemp)
  local code
  code=$(curl -s -o "$tmp" -w "%{http_code}" -X "$method" \
    "${BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    "$@" 2>/dev/null)
  local body
  body=$(cat "$tmp")
  rm -f "$tmp"
  echo "$code $body"
}

# ─── 0. TOKEN ALMA ────────────────────────────────────────────────────────────

header "0. Auth — Token Alma"

# Öğrenci token'ı (isAdmin: false)
if [[ -z "${STUDENT_JWT:-}" ]]; then
  read -r code body <<< "$(curl_j POST /api/v1/auth/login \
    -d '{"studentId":"student001","major":"CS","isAdmin":false}')"
  check "POST /api/v1/auth/login (öğrenci)" 201 "$code" "$body"
  STUDENT_JWT=$(echo "$body" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
fi

# Admin token'ı (isAdmin: true)
if [[ -z "${ADMIN_JWT:-}" ]]; then
  read -r code body <<< "$(curl_j POST /api/v1/auth/login \
    -d '{"studentId":"admin001","major":"CS","isAdmin":true}')"
  check "POST /api/v1/auth/login (admin)" 201 "$code" "$body"
  ADMIN_JWT=$(echo "$body" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
fi

echo ""
echo -e "  ${YELLOW}STUDENT_JWT:${NC} ${STUDENT_JWT:0:40}..."
echo -e "  ${YELLOW}ADMIN_JWT:${NC}   ${ADMIN_JWT:0:40}..."

AUTH="-H \"Authorization: Bearer ${STUDENT_JWT}\""
ADMIN_AUTH="-H \"Authorization: Bearer ${ADMIN_JWT}\""

# ─── 1. COURSES ───────────────────────────────────────────────────────────────

header "1. Courses"

read -r code body <<< "$(curl_j GET "/api/v1/courses" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/courses (tümü)" 200 "$code" "$body"

read -r code body <<< "$(curl_j GET "/api/v1/courses?q=algoritma" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/courses?q=algoritma" 200 "$code" "$body"

read -r code body <<< "$(curl_j GET "/api/v1/courses?major=CS&faculty=FENS&page=1&pageSize=5" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/courses?major=CS&faculty=FENS&page=1&pageSize=5" 200 "$code" "$body"

read -r code body <<< "$(curl_j GET "/api/v1/courses/IF100" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/courses/IF100" 200 "$code" "$body"

read -r code body <<< "$(curl_j GET "/api/v1/courses/CS201" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/courses/CS201" 200 "$code" "$body"

# 401 kontrolü — token'sız
read -r code body <<< "$(curl_j GET "/api/v1/courses")"
check "GET /api/v1/courses (token yok → 401)" 401 "$code" "$body"

# ─── 2. GRADUATION ────────────────────────────────────────────────────────────

header "2. Graduation"

read -r code body <<< "$(curl_j GET \
  "/api/v1/graduation/student001?major=CS&completed=IF100,CS201,CS301&semester=5" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/graduation/:studentId" 200 "$code" "$body"

read -r code body <<< "$(curl_j GET \
  "/api/v1/graduation/student001" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/graduation/:studentId (boş completed)" 200 "$code" "$body"

# ─── 3. PLAN ─────────────────────────────────────────────────────────────────

header "3. Semester Plan"

read -r code body <<< "$(curl_j GET \
  "/api/v1/plan/student001?major=CS&completed=IF100,CS201&targetSemester=3&maxEcts=30" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/plan/:studentId" 200 "$code" "$body"

read -r code body <<< "$(curl_j POST "/api/v1/plan/student001" \
  -H "Authorization: Bearer ${STUDENT_JWT}" \
  -d '{"major":"CS","completedCourses":["IF100","CS201","CS301"],"targetSemester":4,"maxEcts":28}')"
check "POST /api/v1/plan/:studentId" 201 "$code" "$body"

# ─── 4. PATH RECOMMENDATION ──────────────────────────────────────────────────

header "4. Path Recommendation"

read -r code body <<< "$(curl_j GET \
  "/api/v1/path/student001?major=CS&completed=IF100,CS201,CS412" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/path/:studentId" 200 "$code" "$body"

# ─── 5. RAG / CHAT ───────────────────────────────────────────────────────────

header "5. RAG — Chat (SSE)"

# SSE endpoint'i — sadece bağlantı açılıyor mu kontrol et (10s timeout)
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BASE_URL}/api/v1/rag/ask" \
  -H "Authorization: Bearer ${STUDENT_JWT}" \
  -H "Content-Type: application/json" \
  --max-time 5 \
  -d '{"question":"IF100 önkoşulları neler?","studentId":"student001","major":"CS","completedCourses":[],"currentSemester":1}' \
  2>/dev/null || true)
check "POST /api/v1/rag/ask (SSE bağlantı)" 200 "$code"

read -r code body <<< "$(curl_j GET \
  "/api/v1/rag/similar?text=NLP+dersleri&collection=su_reviews&topK=5" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/rag/similar" 200 "$code" "$body"

# contextType ile farklı prompt şablonu
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BASE_URL}/api/v1/rag/ask" \
  -H "Authorization: Bearer ${STUDENT_JWT}" \
  -H "Content-Type: application/json" \
  --max-time 5 \
  -d '{"question":"Mezuniyetim için ne kalıyor?","studentId":"student001","major":"CS","completedCourses":["IF100","CS201"],"currentSemester":3,"contextType":"graduation_check"}' \
  2>/dev/null || true)
check "POST /api/v1/rag/ask (contextType=graduation_check)" 200 "$code"

# ─── 6. INSTRUCTORS ──────────────────────────────────────────────────────────

header "6. Instructors"

read -r code body <<< "$(curl_j GET "/api/v1/instructors?page=1&pageSize=10" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/instructors (liste)" 200 "$code" "$body"

read -r code body <<< "$(curl_j GET \
  "/api/v1/instructors/$(python3 -c 'import urllib.parse; print(urllib.parse.quote("Ercan Solak"))')" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/instructors/:name (Ercan Solak)" 200 "$code" "$body"

read -r code body <<< "$(curl_j GET \
  "/api/v1/instructors/$(python3 -c 'import urllib.parse; print(urllib.parse.quote("Ercan Solak"))')?courseCode=CS412" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/instructors/:name?courseCode=CS412" 200 "$code" "$body"

# ─── 7. ADMIN — WhatsApp Upload ──────────────────────────────────────────────

header "7. Admin — WhatsApp Batch"

SAMPLE_WA="[12.01.2024, 14:23:01] Ahmet: Ercan hoca CS412 dersinde çok iyi anlatıyor tavsiye ederim
[12.01.2024, 14:25:33] Mehmet: Bence de harika bir hoca, adil sınavlar yapıyor
[12.01.2024, 14:30:12] Ayşe: CS412 sınavı zor ama hoca yardımcı oluyor"

# Admin olmayan kullanıcıyla → 403
read -r code body <<< "$(curl_j POST "/api/v1/admin/whatsapp" \
  -H "Authorization: Bearer ${STUDENT_JWT}" \
  -d "{\"rawText\":\"$(echo "$SAMPLE_WA" | tr '\n' '|')\",\"filename\":\"test.txt\"}")"
check "POST /api/v1/admin/whatsapp (admin değil → 403)" 403 "$code" "$body"

# Admin ile yükle
PAYLOAD=$(jq -n --arg text "$SAMPLE_WA" --arg fn "test.txt" \
  '{"rawText":$text,"filename":$fn}')
read -r code body <<< "$(curl_j POST "/api/v1/admin/whatsapp" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -d "$PAYLOAD")"
check "POST /api/v1/admin/whatsapp (admin)" 201 "$code" "$body"

# batch_id'yi yakala
BATCH_ID=$(echo "$body" | grep -o '"batch_id":"[^"]*"' | cut -d'"' -f4 || true)
echo -e "  ${YELLOW}batch_id:${NC} ${BATCH_ID:-<yakalanamadı>}"

# Onaya sun (approve)
if [[ -n "$BATCH_ID" ]]; then
  read -r code body <<< "$(curl_j POST "/api/v1/admin/whatsapp/${BATCH_ID}/confirm" \
    -H "Authorization: Bearer ${ADMIN_JWT}" \
    -d '{"approved":true}')"
  check "POST /api/v1/admin/whatsapp/:batchId/confirm (approve)" 201 "$code" "$body"

  # Silme testi için yeni batch yükle
  read -r code body <<< "$(curl_j POST "/api/v1/admin/whatsapp" \
    -H "Authorization: Bearer ${ADMIN_JWT}" \
    -d "$PAYLOAD")"
  check "POST /api/v1/admin/whatsapp (silme testi için 2. batch)" 201 "$code" "$body"
  DEL_BATCH_ID=$(echo "$body" | grep -o '"batch_id":"[^"]*"' | cut -d'"' -f4 || true)

  if [[ -n "$DEL_BATCH_ID" ]]; then
    # Reddet (approve: false)
    read -r code body <<< "$(curl_j POST "/api/v1/admin/whatsapp/${DEL_BATCH_ID}/confirm" \
      -H "Authorization: Bearer ${ADMIN_JWT}" \
      -d '{"approved":false}')"
    check "POST /api/v1/admin/whatsapp/:batchId/confirm (reject)" 201 "$code" "$body"

    # Sil (pending durumda olması için yeni batch yükle)
    read -r code body <<< "$(curl_j POST "/api/v1/admin/whatsapp" \
      -H "Authorization: Bearer ${ADMIN_JWT}" \
      -d "$PAYLOAD")"
    DEL_BATCH_ID2=$(echo "$body" | grep -o '"batch_id":"[^"]*"' | cut -d'"' -f4 || true)

    if [[ -n "$DEL_BATCH_ID2" ]]; then
      read -r code body <<< "$(curl_j DELETE "/api/v1/admin/whatsapp/${DEL_BATCH_ID2}" \
        -H "Authorization: Bearer ${ADMIN_JWT}")"
      check "DELETE /api/v1/admin/whatsapp/:batchId" 200 "$code" "$body"
    fi
  fi
fi

# ─── 8. EXAMS ────────────────────────────────────────────────────────────────

header "8. Exams"

read -r code body <<< "$(curl_j GET "/api/v1/exams" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/exams (tümü)" 200 "$code" "$body"

read -r code body <<< "$(curl_j GET "/api/v1/exams?courseCode=CS412&year=2024&semester=fall&type=midterm" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/exams?courseCode=CS412&year=2024&semester=fall&type=midterm" 200 "$code" "$body"

read -r code body <<< "$(curl_j GET "/api/v1/exams?page=1&pageSize=5" \
  -H "Authorization: Bearer ${STUDENT_JWT}")"
check "GET /api/v1/exams?page=1&pageSize=5" 200 "$code" "$body"

# ─── 9. ADMIN — Exam Upload ──────────────────────────────────────────────────

header "9. Admin — Exam Upload & Delete"

# Admin olmayan → 403
read -r code body <<< "$(curl_j POST "/api/v1/admin/exams" \
  -H "Authorization: Bearer ${STUDENT_JWT}" \
  -d '{"courseCode":"CS412","year":2024,"semester":"fall","type":"midterm","fileName":"test.pdf","uploadedBy":"admin001"}')"
check "POST /api/v1/admin/exams (admin değil → 403)" 403 "$code" "$body"

# Admin ile yükle
read -r code body <<< "$(curl_j POST "/api/v1/admin/exams" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -d '{"courseCode":"CS412","year":2024,"semester":"fall","type":"midterm","fileName":"cs412-midterm-2024.pdf","uploadedBy":"admin001"}')"
check "POST /api/v1/admin/exams" 201 "$code" "$body"

EXAM_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 || true)
echo -e "  ${YELLOW}exam_id:${NC} ${EXAM_ID:-<yakalanamadı>}"

if [[ -n "$EXAM_ID" ]]; then
  # Tek sınav getir
  read -r code body <<< "$(curl_j GET "/api/v1/exams/${EXAM_ID}" \
    -H "Authorization: Bearer ${STUDENT_JWT}")"
  check "GET /api/v1/exams/:id" 200 "$code" "$body"

  # Presigned URL
  read -r code body <<< "$(curl_j GET "/api/v1/exams/${EXAM_ID}/url" \
    -H "Authorization: Bearer ${STUDENT_JWT}")"
  check "GET /api/v1/exams/:id/url (presigned URL)" 200 "$code" "$body"

  # Sil
  read -r code body <<< "$(curl_j DELETE "/api/v1/admin/exams/${EXAM_ID}" \
    -H "Authorization: Bearer ${ADMIN_JWT}")"
  check "DELETE /api/v1/admin/exams/:id" 200 "$code" "$body"

  # Silindi mi doğrula
  read -r code body <<< "$(curl_j GET "/api/v1/exams/${EXAM_ID}" \
    -H "Authorization: Bearer ${STUDENT_JWT}")"
  check "GET /api/v1/exams/:id (silindikten sonra → 404)" 404 "$code" "$body"
fi

# ─── ÖZET ─────────────────────────────────────────────────────────────────────

header "Test Sonuçları"
TOTAL=$((PASS + FAIL))
echo -e "  Toplam : ${TOTAL}"
echo -e "  ${GREEN}Başarılı: ${PASS}${NC}"
if [[ "$FAIL" -gt 0 ]]; then
  echo -e "  ${RED}Başarısız: ${FAIL}${NC}"
else
  echo -e "  Başarısız: ${FAIL}"
fi
echo ""

[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
