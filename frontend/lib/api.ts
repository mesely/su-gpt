const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

async function req<T>(
  method: string,
  path: string,
  token?: string | null,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[${res.status}] ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  // Auth
  login: (studentId: string, major: string, isAdmin = false) =>
    req<{ accessToken: string }>('POST', '/auth/login', null, { studentId, major, isAdmin }),

  // Courses
  searchCourses: (token: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return req<{ courses: Course[]; total: number }>('GET', `/courses${qs}`, token)
  },
  getCourse: (token: string, code: string) =>
    req<Course>('GET', `/courses/${code}`, token),

  // Graduation
  getGraduationStatus: (token: string, studentId: string, params: Record<string, string>) => {
    const qs = '?' + new URLSearchParams(params).toString()
    return req<GraduationStatus>('GET', `/graduation/${studentId}${qs}`, token)
  },

  // Plan
  getSemesterPlan: (token: string, studentId: string, params: Record<string, string>) => {
    const qs = '?' + new URLSearchParams(params).toString()
    return req<SemesterPlan>('GET', `/plan/${studentId}${qs}`, token)
  },
  updatePlan: (token: string, studentId: string, body: unknown) =>
    req<SemesterPlan>('POST', `/plan/${studentId}`, token, body),

  // Path
  getPathRecommendation: (token: string, studentId: string, params: Record<string, string>) => {
    const qs = '?' + new URLSearchParams(params).toString()
    return req<PathRecommendation>('GET', `/path/${studentId}${qs}`, token)
  },

  // RAG streaming
  askStream: (token: string, body: AskBody): ReadableStream<string> => {
    const ctrl = new AbortController()
    const timeoutMs = 45_000
    let timeout: ReturnType<typeof setTimeout> | undefined
    const stream = new ReadableStream<string>({
      async start(controller) {
        timeout = setTimeout(() => ctrl.abort(), timeoutMs)
        try {
          const res = await fetch(`${BASE}/rag/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          })
          if (!res.ok) {
            const errText = await res.text().catch(() => `HTTP ${res.status}`)
            controller.enqueue(`\n\n[Hata ${res.status}: ${errText}]`)
            controller.close()
            return
          }
          if (!res.body) {
            controller.enqueue('\n\n[Yanit govdesi bos]')
            controller.close()
            return
          }
          const reader = res.body.getReader()
          const dec = new TextDecoder()
          let buf = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (timeout) clearTimeout(timeout)
            timeout = setTimeout(() => ctrl.abort(), timeoutMs)
            buf += dec.decode(value, { stream: true })
            const lines = buf.split(/\r?\n/)
            buf = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.startsWith('data:')) continue
              const json = line.slice(5).trim()
              if (json === '[DONE]') { controller.close(); return }
              try {
                const parsed = JSON.parse(json) as { chunk?: string; done?: boolean; error?: string }
                if (parsed.chunk) controller.enqueue(parsed.chunk)
                if (parsed.error) controller.enqueue(`\n\n[${parsed.error}]`)
                if (parsed.done) { controller.close(); return }
              } catch { /* skip malformed */ }
            }
          }
          controller.close()
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            controller.enqueue('\n\n[Baglanti zaman asimina ugradi. Tekrar deneyin.]')
            controller.close()
            return
          }
          controller.enqueue(`\n\n[Baglanti hatasi: ${err instanceof Error ? err.message : String(err)}]`)
          controller.close()
        } finally {
          if (timeout) clearTimeout(timeout)
        }
      },
      cancel() { ctrl.abort() },
    })
    return stream
  },

  getSimilarChunks: (token: string, text: string, collection = 'su_reviews', topK = 5) =>
    req<{ chunks: Chunk[] }>('GET', `/rag/similar?text=${encodeURIComponent(text)}&collection=${collection}&topK=${topK}`, token),

  listInstructors: (token: string, page = 1, pageSize = 20) =>
    req<{ instructors: InstructorItem[]; total: number }>('GET', `/instructors?page=${page}&pageSize=${pageSize}`, token),
  getInstructorSummary: (token: string, name: string, courseCode?: string) => {
    const qs = courseCode ? `?courseCode=${courseCode}` : ''
    return req<InstructorSummary>('GET', `/instructors/${encodeURIComponent(name)}${qs}`, token)
  },

  getExams: (token: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return req<{ exams: Exam[]; total: number }>('GET', `/exams${qs}`, token)
  },
  getExamUrl: (token: string, id: string) =>
    req<{ presigned_url: string; expires_at: string }>('GET', `/exams/${id}/url`, token),

  uploadWhatsapp: (token: string, rawText: string, filename = 'upload.txt') =>
    req<WhatsappUploadResponse>('POST', '/admin/whatsapp', token, { rawText, filename }),
  confirmWhatsapp: (token: string, batchId: string, approved: boolean) =>
    req<{ ingested_count: number; success: boolean }>('POST', `/admin/whatsapp/${batchId}/confirm`, token, { approved }),
  deleteWhatsappBatch: (token: string, batchId: string) =>
    req<{ success: boolean }>('DELETE', `/admin/whatsapp/${batchId}`, token),

  uploadExam: (token: string, body: UploadExamBody) =>
    req<Exam>('POST', '/admin/exams', token, body),
  deleteExam: (token: string, id: string) =>
    req<{ success: boolean }>('DELETE', `/admin/exams/${id}`, token),

  // Course selection persistence
  getSelections: (token: string) =>
    req<{
      selectedCourses: string[]
      isComplete: boolean
      inProgressCourses: string[]
      lastPlanMajor: string | null
      lastPlanDifficulty: 'easy' | 'balanced' | 'hard' | null
    }>('GET', '/selections/me', token),
  saveSelections: (token: string, body: {
    selectedCourses: string[]
    isComplete: boolean
    inProgressCourses: string[]
    lastPlanMajor: string | null
    lastPlanDifficulty: 'easy' | 'balanced' | 'hard' | null
  }) =>
    req<{ ok: boolean }>('PUT', '/selections/me', token, body),
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Course {
  _id: string
  fullCode: string
  code: string
  major: string
  name: string
  ects: number
  suCredit: number
  faculty: string
  elType: string
  categories: { isCore: boolean; isArea: boolean; isBasicScience: boolean }
  prerequisites: string[]
  instructors: string[]
  description?: string
}

export interface GraduationStatus {
  studentId?: string
  major: string
  // Actual gRPC response fields (values in SU credits):
  totalCompletedEcts?: number
  totalRequiredEcts?: number
  isEligible?: boolean
  categoryStatuses?: Array<{
    category: string
    completedEcts: number
    requiredEcts: number
    satisfied: boolean
    missingCourses: string[]
  }>
  pathProgresses?: Array<{
    pathId: string
    pathName: string
    completionPct: number
    completed: string[]
    missing: string[]
  }>
  estimatedSemestersLeft?: number
  // Legacy field names (backward compat):
  completedEcts?: number
  totalEcts?: number
  categories?: Record<string, { required: number; completed: number; courses: string[] }>
  missingCourses?: string[]
  paths?: Record<string, { name: string; completionPct: number }>
}

export interface SemesterPlan {
  studentId: string
  targetSemester: number
  courses: Course[]
  totalEcts: number
}

export interface PathRecommendation {
  recommendedPath: string
  paths: Array<{ id: string; name: string; completionPct: number; nextCourses: string[] }>
  reasoning: string
}

export interface AskBody {
  question: string
  studentId: string
  major: string
  completedCourses?: string[]
  currentSemester?: number
  contextType?: string
}

export interface Chunk {
  id: string; text: string; score: number; metadata: Record<string, string>
}

export interface InstructorItem {
  instructorName: string; totalReviews: number; sentimentScore: number; courses: string[]
}

export interface InstructorSummary {
  instructorName: string
  courseCode: string
  positiveCount: number
  negativeCount: number
  neutralCount: number
  topPositiveKeywords: string[]
  topNegativeKeywords: string[]
  recommendation: string
  sentimentScore: number
}

export interface Exam {
  id: string; courseCode: string; year: number; semester: string
  type: string; fileName: string; uploadedBy: string; createdAt: string
}

export interface WhatsappUploadResponse {
  batchId: string
  totalMessages: number
  parsedReviews: number
  success: boolean
  preview: Array<{ instructorName: string; courseCode: string; anonymizedText: string; sentiment: string }>
}

export interface UploadExamBody {
  courseCode: string; year: number; semester: string; type: string; fileName: string; uploadedBy: string
}
