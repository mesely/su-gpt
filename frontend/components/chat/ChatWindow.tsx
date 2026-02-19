'use client'
import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageBubble } from './MessageBubble'
import { CourseSelector } from './CourseSelector'
import { useChatStore, useAuthStore, useCourseSelectionStore } from '@/lib/store'
import { api, Course } from '@/lib/api'
import { cn } from '@/lib/utils'

const MAJOR_LABELS: Record<string, string> = {
  CS: 'Bilgisayar Bil.', IF: 'Bilgi Sistemleri', EE: 'Elektrik-Elektronik',
  ME: 'Makine Müh.', IE: 'Endüstri Müh.', MAT: 'Matematik', BIO: 'Biyoloji',
}
const MAJORS = Object.keys(MAJOR_LABELS)

type WizardType = 'graduation' | 'plan' | 'path' | null
type WizardStep = 'major-select' | 'course-select' | 'track-select' | 'difficulty-select' | 'sending' | null
type IntentType = 'graduation' | 'plan' | 'path' | null
type Track = 'ai_nlp' | 'ai_cv' | 'control' | 'fullstack' | 'crypto' | 'arttech' | null
type Difficulty = 'easy' | 'balanced' | 'hard' | null

interface WizardData {
  type: WizardType
  step: WizardStep
  major: string
  track: Track
  difficulty: Difficulty
}

const INITIAL_WIZARD: WizardData = {
  type: null,
  step: null,
  major: '',
  track: null,
  difficulty: null,
}

const REQUIRED_CS = ['CS201', 'CS204', 'CS300', 'CS301', 'CS303', 'CS306', 'CS308', 'CS395', 'ENS491', 'ENS492', 'MATH203', 'MATH204', 'MATH212', 'PHYS113']
const UNIVERSITY_CS = ['IF100', 'MATH101', 'MATH102', 'SPS101', 'SPS102', 'TLL101', 'TLL102', 'HIST191', 'HIST192', 'AL102', 'NS101', 'NS102', 'PROJ201', 'SPS303']
const BASIC_SCI = ['MATH101', 'MATH102', 'MATH203', 'MATH204', 'MATH212', 'PHYS113', 'NS101', 'NS102']

const TRACKS: Record<Exclude<Track, null>, { label: string; courses: string[]; detail: string }> = {
  ai_nlp: {
    label: 'AI - NLP',
    courses: ['CS412', 'VS445', 'CS464', 'CS461', 'CS514'],
    detail: 'NLP için önerilen sıra: CS412 -> VS445 -> CS464',
  },
  ai_cv: {
    label: 'AI - Computer Vision',
    courses: ['EE417', 'CS484', 'CS585', 'CS489'],
    detail: 'CV için önerilen sıra: EE417 -> CS484 -> CS585',
  },
  control: {
    label: 'Control / Systems',
    courses: ['ENS211', 'EE202', 'ME301', 'ME402'],
    detail: 'IE/ME öğrencileri için kontrol odaklı bir yol.',
  },
  fullstack: {
    label: 'Full Stack Engineer',
    courses: ['CS306', 'CS308', 'CS405', 'CS412'],
    detail: 'Backend + yazılım mühendisliği ağırlıklı ilerleme.',
  },
  crypto: {
    label: 'Kriptografi / Güvenlik',
    courses: ['CS403', 'CS404', 'CS406', 'MATH306'],
    detail: 'Kripto-güvenlik için matematik + sistem yaklaşımı.',
  },
  arttech: {
    label: 'Art & Technology',
    courses: ['VACD101', 'VACD201', 'HUM312', 'CS306'],
    detail: 'Sanat-teknoloji kesişimi için hibrit yol.',
  },
}

function detectIntent(question: string): IntentType {
  const q = question.toLowerCase().trim()
  if (!q) return null
  if (q.includes('mezuniyet') || q.includes('eksik ders')) return 'graduation'
  if (q.includes('bu dönem') || q.includes('ne almalıyım') || q.includes('plan')) return 'plan'
  if (q.includes('hangi alanda') || q.includes('path') || q.includes('cv') || q.includes('nlp')) return 'path'
  return null
}

function trackLabel(track: Track) {
  if (!track) return 'Genel'
  return TRACKS[track].label
}

function shortCourse(code: string, map: Map<string, Course>) {
  const course = map.get(code)
  if (!course) return `- **${code}**`
  return `- **${code}** - ${course.name}${course.description ? ` - ${course.description.slice(0, 90)}...` : ''}`
}

function buildGraduationReply(major: string, selected: string[], map: Map<string, Course>) {
  const reqCore = major === 'CS' ? REQUIRED_CS : []
  const reqUni = major === 'CS' ? UNIVERSITY_CS : []

  const missingCore = reqCore.filter((c) => !selected.includes(c))
  const missingUni = reqUni.filter((c) => !selected.includes(c))
  const missingBS = BASIC_SCI.filter((c) => !selected.includes(c))

  return `## Mezuniyet Durumu - ${major}

Seçtiğin **${selected.length} ders** üzerinden mezuniyet yeterliliklerine göre hesapladım.

### Zorunlu Dersler
${missingCore.length ? missingCore.slice(0, 6).map((c) => shortCourse(c, map)).join('\n') : '✅ Zorunlu dersler tamam görünüyor.'}

### Üniversite Dersleri (HIST/TLL/AL dahil)
${missingUni.length ? missingUni.slice(0, 6).map((c) => shortCourse(c, map)).join('\n') : '✅ Üniversite dersleri kısmı tamam görünüyor.'}

### Temel Bilim
${missingBS.length ? missingBS.slice(0, 4).map((c) => shortCourse(c, map)).join('\n') : '✅ Temel bilim gereklilikleri tamam görünüyor.'}

Not: Bu çıktı Degree Evaluation yerine geçmez; resmi sayım için sistem çıktısını doğrula.`
}

function buildGraduationFromStatus(status: {
  completedEcts?: number
  totalEcts?: number
  categories?: Record<string, { required: number; completed: number }>
  missingCourses?: string[]
  estimatedSemestersLeft?: number
}, major: string, map: Map<string, Course>) {
  const cats = status.categories ?? {}
  const catLines = Object.entries(cats).map(([k, v]) => `- **${k}**: ${v.completed}/${v.required}`)
  const missing = (status.missingCourses ?? []).slice(0, 8)
  return `## Mezuniyet Durumu - ${major}

Toplam: **${status.completedEcts ?? 0}/${status.totalEcts ?? 240} ECTS**
${catLines.length ? `\n${catLines.join('\n')}` : ''}

### Eksik derslerden örnekler
${missing.length ? missing.map((c) => shortCourse(c, map)).join('\n') : 'Eksik ders listesi bulunamadı.'}

Tahmini kalan dönem: **${status.estimatedSemestersLeft ?? '?'}**`
}

function buildPlanReply(major: string, selected: string[], track: Track, difficulty: Difficulty, map: Map<string, Course>) {
  const trackCourses = track ? TRACKS[track].courses : []
  const corePool = major === 'CS' ? REQUIRED_CS : []

  const nextCore = corePool.filter((c) => !selected.includes(c)).slice(0, difficulty === 'hard' ? 4 : 2)
  const nextTrack = trackCourses.filter((c) => !selected.includes(c)).slice(0, difficulty === 'easy' ? 1 : 2)
  const helper = difficulty === 'easy'
    ? ['ACC101', 'HUM201']
    : difficulty === 'hard'
    ? ['MATH306', 'ENS211']
    : ['SPS303', 'ECON201']

  const list = [...nextCore, ...nextTrack, ...helper].filter((v, i, a) => a.indexOf(v) === i)

  return `## Bu Dönem Ne Almalıyım? - ${major}

Seçilen alan: **${trackLabel(track)}** · Zorluk: **${difficulty ?? 'balanced'}**

${list.map((c) => shortCourse(c, map)).join('\n')}

${track ? `\nYol Notu: ${TRACKS[track].detail}` : ''}

Daha kolay ister misin? "daha kolay" yaz. Daha zor istersen "daha zor" yaz.`
}

function buildPathReply(track: Track, selected: string[], map: Map<string, Course>) {
  if (!track) {
    return 'Hangi alana ilerlemek istediğini seçersen sana o alana özel ders patikası çıkarırım.'
  }
  const cfg = TRACKS[track]
  const done = cfg.courses.filter((c) => selected.includes(c))
  const missing = cfg.courses.filter((c) => !selected.includes(c))
  const pct = Math.round((done.length / cfg.courses.length) * 100)

  return `## Alan Yolu - ${cfg.label}

Tamamlanma: **%${pct}** (${done.length}/${cfg.courses.length})

### Kalan dersler
${missing.length ? missing.map((c) => shortCourse(c, map)).join('\n') : '✅ Bu yol için önerilen dersler tamam.'}

${cfg.detail}`
}

async function streamText(text: string, onChunk: (c: string) => void) {
  for (let i = 0; i < text.length; i++) {
    onChunk(text[i])
    if (i % 8 === 0) await new Promise((r) => setTimeout(r, 9))
  }
}

export function ChatWindow() {
  const {
    sessions,
    activeSessionId,
    newSession,
    switchSession,
    deleteSession,
    messages,
    isStreaming,
    addMessage,
    appendToLast,
    setStreaming,
    clearMessages,
  } = useChatStore()
  const { token, studentId, major: authMajor } = useAuthStore()
  const { selectedCourses, isComplete, markComplete } = useCourseSelectionStore()

  const [input, setInput] = useState('')
  const [wizard, setWizard] = useState<WizardData>(INITIAL_WIZARD)
  const [showPanel, setShowPanel] = useState(false)
  const [courseMap, setCourseMap] = useState<Map<string, Course>>(new Map())
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, wizard.step])

  useEffect(() => {
    if (!activeSessionId) newSession()
  }, [activeSessionId, newSession])

  useEffect(() => {
    if (!token) return
    api.searchCourses(token, { pageSize: '5000' })
      .then((res) => {
        const map = new Map<string, Course>()
        for (const c of res.courses ?? []) map.set(c.fullCode, c)
        setCourseMap(map)
      })
      .catch(() => setCourseMap(new Map()))
  }, [token])

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [sessions],
  )

  const streamWizardReply = useCallback(async (text: string) => {
    addMessage({ role: 'assistant', content: '' })
    setStreaming(true)
    await streamText(text, appendToLast)
    setStreaming(false)
  }, [addMessage, appendToLast, setStreaming])

  const sendRag = useCallback(async (question: string, contextType = 'course_qa') => {
    if (!question.trim() || isStreaming || !token) return
    addMessage({ role: 'user', content: question })
    addMessage({ role: 'assistant', content: '' })
    setStreaming(true)

    try {
      const stream = api.askStream(token, {
        question,
        studentId: studentId ?? 'anonymous',
        major: authMajor,
        completedCourses: selectedCourses,
        contextType,
      })
      const reader = stream.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        appendToLast(value)
      }
      appendToLast('\n\n_Not: Matematik/kodlama için özel fine-tuned model değilim; kritik kısımları doğrulamanı öneririm._')
    } catch (err) {
      appendToLast(`\n\n[Hata: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}]`)
    } finally {
      setStreaming(false)
    }
  }, [isStreaming, token, studentId, authMajor, selectedCourses, addMessage, appendToLast, setStreaming])

  const startGraduationWizard = useCallback(() => {
    if (isStreaming) return
    addMessage({ role: 'assistant', content: 'Mezuniyet analizi için önce bölümünü seç.', isWizard: true })
    setWizard({ type: 'graduation', step: 'major-select', major: '', track: null, difficulty: null })
  }, [isStreaming, addMessage])

  const startPlanWizard = useCallback(() => {
    if (isStreaming) return
    if (isComplete && selectedCourses.length > 0) {
      addMessage({ role: 'assistant', content: `Kayıtlı ${selectedCourses.length} dersin var. Şimdi alan seçelim.`, isWizard: true })
      setWizard({ type: 'plan', step: 'track-select', major: authMajor, track: null, difficulty: null })
      return
    }
    addMessage({ role: 'assistant', content: 'Dönem planı için önce bölüm seç ve aldığın dersleri işaretle.', isWizard: true })
    setWizard({ type: 'plan', step: 'major-select', major: '', track: null, difficulty: null })
  }, [isStreaming, isComplete, selectedCourses, authMajor, addMessage])

  const startPathWizard = useCallback(() => {
    if (isStreaming) return
    addMessage({ role: 'assistant', content: 'Hangi alanda ilerlemek istediğini seç.', isWizard: true })
    setWizard({ type: 'path', step: 'track-select', major: authMajor, track: null, difficulty: null })
  }, [isStreaming, authMajor, addMessage])

  const handleWizardSelect = useCallback(async (payload: {
    major?: string
    track?: Exclude<Track, null>
    difficulty?: Exclude<Difficulty, null>
    coursesDone?: boolean
  }) => {
    if (isStreaming) return
    const { type, step, major, track } = wizard

    if (step === 'major-select' && payload.major) {
      addMessage({ role: 'user', content: `${payload.major} - ${MAJOR_LABELS[payload.major] ?? payload.major}` })
      setWizard((w) => ({ ...w, major: payload.major! }))

      if (isComplete && selectedCourses.length > 0) {
        if (type === 'graduation') {
          if (token && studentId) {
            try {
              const status = await api.getGraduationStatus(token, studentId, {
                major: payload.major,
                semester: '1',
                completed: selectedCourses.join(','),
              })
              await streamWizardReply(buildGraduationFromStatus(status, payload.major, courseMap))
            } catch {
              await streamWizardReply(buildGraduationReply(payload.major, selectedCourses, courseMap))
            }
          } else {
            await streamWizardReply(buildGraduationReply(payload.major, selectedCourses, courseMap))
          }
          setWizard(INITIAL_WIZARD)
          return
        }
        addMessage({ role: 'assistant', content: 'Kayıtlı derslerini buldum. Şimdi alan seçelim.', isWizard: true })
        setWizard((w) => ({ ...w, major: payload.major!, step: 'track-select' }))
        return
      }

      addMessage({ role: 'assistant', content: 'Ders panelinden aldığın dersleri seç ve Kaydet bas.', isWizard: true })
      setWizard((w) => ({ ...w, major: payload.major!, step: 'course-select' }))
      setShowPanel(true)
      return
    }

    if (step === 'course-select' && payload.coursesDone) {
      markComplete()
      setShowPanel(false)
      addMessage({ role: 'user', content: `${selectedCourses.length} ders seçildi` })

      if (type === 'graduation') {
        const finalMajor = major || authMajor
        if (token && studentId) {
          try {
            const status = await api.getGraduationStatus(token, studentId, {
              major: finalMajor,
              semester: '1',
              completed: selectedCourses.join(','),
            })
            await streamWizardReply(buildGraduationFromStatus(status, finalMajor, courseMap))
          } catch {
            await streamWizardReply(buildGraduationReply(finalMajor, selectedCourses, courseMap))
          }
        } else {
          await streamWizardReply(buildGraduationReply(finalMajor, selectedCourses, courseMap))
        }
        setWizard(INITIAL_WIZARD)
        return
      }

      addMessage({ role: 'assistant', content: 'Şimdi alan seçelim.', isWizard: true })
      setWizard((w) => ({ ...w, step: 'track-select' }))
      return
    }

    if (step === 'track-select' && payload.track) {
      addMessage({ role: 'user', content: TRACKS[payload.track].label })
      setWizard((w) => ({ ...w, track: payload.track }))

      if (type === 'path') {
        await streamWizardReply(buildPathReply(payload.track, selectedCourses, courseMap))
        setWizard(INITIAL_WIZARD)
        return
      }

      addMessage({ role: 'assistant', content: 'Zorluk seviyesini seç.', isWizard: true })
      setWizard((w) => ({ ...w, step: 'difficulty-select' }))
      return
    }

    if (step === 'difficulty-select' && payload.difficulty) {
      addMessage({ role: 'user', content: payload.difficulty })
      setWizard((w) => ({ ...w, difficulty: payload.difficulty, step: 'sending' }))
      await streamWizardReply(buildPlanReply(major || authMajor, selectedCourses, track, payload.difficulty, courseMap))
      setWizard(INITIAL_WIZARD)
    }
  }, [isStreaming, wizard, addMessage, isComplete, selectedCourses, streamWizardReply, markComplete, authMajor, courseMap, token, studentId])

  const dispatchInput = useCallback((text: string) => {
    const cleaned = text.trim()
    if (!cleaned) return

    const intent = detectIntent(cleaned)
    if (intent === 'graduation') return startGraduationWizard()
    if (intent === 'plan') return startPlanWizard()
    if (intent === 'path') return startPathWizard()

    setWizard(INITIAL_WIZARD)
    sendRag(cleaned)
  }, [sendRag, startGraduationWizard, startPlanWizard, startPathWizard])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim()) {
        dispatchInput(input)
        setInput('')
      }
    }
  }

  const handleSend = () => {
    if (input.trim()) {
      dispatchInput(input)
      setInput('')
    }
  }

  return (
    <div className="flex h-full gap-4">
      <div className="hidden lg:flex w-72 glass rounded-[24px] p-3 flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-white/50 uppercase tracking-widest">Sohbet Geçmişi</p>
          <button onClick={newSession} className="text-xs px-2 py-1 rounded-lg bg-su-500/30 text-su-300">+ Yeni</button>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {sortedSessions.map((s) => (
            <div key={s.id} className={cn('rounded-xl p-2 border transition-all', s.id === activeSessionId ? 'border-su-300/50 bg-su-500/15' : 'border-white/10 bg-white/5')}>
              <button className="w-full text-left" onClick={() => switchSession(s.id)}>
                <p className="text-sm text-white truncate">{s.title}</p>
                <p className="text-[10px] text-white/40">{new Date(s.updatedAt).toLocaleString('tr-TR')}</p>
              </button>
              <button onClick={() => deleteSession(s.id)} className="text-[10px] text-white/35 hover:text-red-300 mt-1">sil</button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col flex-1 glass rounded-[28px] overflow-hidden min-w-0">
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-center text-white/60 text-sm">
              3 hazır sorudan birini seç veya direkt açık uçlu soru yaz.
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          <AnimatePresence mode="wait">
            {wizard.step === 'major-select' && (
              <WizardCard key="major">
                <p className="text-xs text-white/50 mb-3">Bölümünü seç:</p>
                <div className="flex flex-wrap gap-2">
                  {MAJORS.map((m) => (
                    <button key={m} onClick={() => handleWizardSelect({ major: m })} className="glass glass-hover rounded-xl px-3 py-1.5 text-xs text-white/80 hover:text-white">
                      <span className="font-bold text-su-300">{m}</span>
                      <span className="text-white/40 ml-1">{MAJOR_LABELS[m]}</span>
                    </button>
                  ))}
                </div>
              </WizardCard>
            )}

            {wizard.step === 'course-select' && !showPanel && (
              <WizardCard key="coursePrompt">
                <p className="text-xs text-white/50 mb-2">Ders panelini açıp aldığın dersleri seç.</p>
                <button onClick={() => setShowPanel(true)} className="text-xs px-3 py-1.5 rounded-xl bg-su-500/20 border border-su-300/30 text-su-300 hover:bg-su-500/30">
                  Paneli aç
                </button>
              </WizardCard>
            )}

            {wizard.step === 'course-select' && showPanel && (
              <WizardCard key="courseDone">
                <p className="text-xs text-white/50 mb-2">{selectedCourses.length} ders seçildi. Kaydet ile devam et.</p>
                <button onClick={() => handleWizardSelect({ coursesDone: true })} disabled={selectedCourses.length === 0} className="text-xs px-3 py-1.5 rounded-xl bg-su-500 text-white hover:bg-su-300 disabled:opacity-30">
                  Devam et
                </button>
              </WizardCard>
            )}

            {wizard.step === 'track-select' && (
              <WizardCard key="track">
                <p className="text-xs text-white/50 mb-3">Alanını seç:</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(TRACKS) as Array<[Exclude<Track, null>, { label: string }]>).map(([id, cfg]) => (
                    <button key={id} onClick={() => handleWizardSelect({ track: id })} className="glass glass-hover rounded-xl px-3 py-2 text-xs text-white/85 text-left hover:text-white">
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </WizardCard>
            )}

            {wizard.step === 'difficulty-select' && (
              <WizardCard key="difficulty">
                <p className="text-xs text-white/50 mb-3">Zorluk seviyesi:</p>
                <div className="flex gap-2">
                  <button onClick={() => handleWizardSelect({ difficulty: 'easy' })} className="glass rounded-xl px-3 py-2 text-xs">Daha kolay</button>
                  <button onClick={() => handleWizardSelect({ difficulty: 'balanced' })} className="glass rounded-xl px-3 py-2 text-xs">Dengeli</button>
                  <button onClick={() => handleWizardSelect({ difficulty: 'hard' })} className="glass rounded-xl px-3 py-2 text-xs">Daha zor</button>
                </div>
              </WizardCard>
            )}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>

        <div className="border-t border-white/10 p-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <QuickChip label="Mezuniyet Durumu" onClick={startGraduationWizard} disabled={isStreaming} />
            <QuickChip label="Bu dönem ne almalıyım?" onClick={startPlanWizard} disabled={isStreaming} />
            <QuickChip label="Hangi alanda ilerlemeliyim?" onClick={startPathWizard} disabled={isStreaming} />
            <QuickChip label="Derslerimi güncelle" onClick={() => setShowPanel(true)} disabled={isStreaming} />
            <QuickChip label="Önceki sınavları sor" onClick={() => setInput('CS204 için önceki sınavlarda en sık çıkan konular neler?')} disabled={isStreaming} />
            <button onClick={clearMessages} className="text-xs text-white/35 hover:text-white/70 px-2">Sohbeti temizle</button>
          </div>

          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={isStreaming}
              rows={1}
              placeholder="Bir şey sor... (Enter gönderir)"
              className={cn('flex-1 bg-transparent text-white placeholder-white/30 text-sm resize-none outline-none', 'max-h-28 overflow-y-auto leading-relaxed')}
              style={{ height: 'auto' }}
              onInput={(e) => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = t.scrollHeight + 'px'
              }}
            />
            <motion.button
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
              whileTap={{ scale: 0.93 }}
              className="w-9 h-9 rounded-full bg-su-500 hover:bg-su-300 disabled:opacity-30 flex items-center justify-center shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" />
              </svg>
            </motion.button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 390 }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="shrink-0 glass rounded-[28px] overflow-hidden flex flex-col"
            style={{ minWidth: 0 }}
          >
            <CourseSelector
              initialMajor={wizard.major || authMajor}
              onSave={() => handleWizardSelect({ coursesDone: true })}
              onClose={() => setShowPanel(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function QuickChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="glass glass-hover rounded-xl px-3 py-1.5 text-xs text-white/80 hover:text-white disabled:opacity-40"
    >
      {label}
    </button>
  )
}

function WizardCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="self-start max-w-2xl"
    >
      <div className="glass rounded-2xl px-4 py-3 border border-su-300/20">
        {children}
      </div>
    </motion.div>
  )
}
