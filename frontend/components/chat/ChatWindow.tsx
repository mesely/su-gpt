'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageBubble } from './MessageBubble'
import { CourseSelector } from './CourseSelector'
import { useChatStore, useAuthStore, useCourseSelectionStore } from '@/lib/store'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── Sabitler ──────────────────────────────────────────────────────────────────

const MAJOR_LABELS: Record<string, string> = {
  CS: 'Bilgisayar Bil.', IF: 'Bilgi Sistemleri', EE: 'Elektrik-Elektronik',
  ME: 'Makine Müh.', IE: 'Endüstri Müh.', MAT: 'Matematik',
  BIO: 'Biyoloji', NS: 'Doğa Bilimleri', PSYC: 'Psikoloji',
}
const MAJORS = Object.keys(MAJOR_LABELS)

// ─── Wizard tipi ───────────────────────────────────────────────────────────────

type WizardType = 'graduation' | 'plan' | 'path' | null
type WizardStep = 'major-select' | 'course-select' | 'ai-path-select' | 'sending' | null

interface WizardData {
  type: WizardType
  step: WizardStep
  major: string
  aiPath: 'nlp' | 'cv' | null
}

const INITIAL_WIZARD: WizardData = { type: null, step: null, major: '', aiPath: null }

// ─── Öneri üretici (yerel, RAG gerekmez) ──────────────────────────────────────

const NLP_COURSES  = ['CS412', 'VS445', 'CS464', 'CS461', 'CS514', 'CS562']
const CV_COURSES   = ['EE417', 'CS484', 'CS585', 'CS489', 'CS580']
const CORE_CS      = ['CS201', 'CS204', 'CS300', 'CS301', 'CS302', 'CS308', 'CS310']
const CORE_IF      = ['IF100', 'IF201', 'IF210', 'IF301', 'IF302']
const BASIC_SCI    = ['MATH101', 'MATH102', 'MATH201', 'PHYS101', 'PHYS102', 'ENS211', 'MATH306']
const FREE_NICE    = ['ECON201', 'PSYC101', 'VA200', 'SPS101', 'HUM101', 'HUM201']

function buildGraduationReply(major: string, aiPath: 'nlp' | 'cv', selected: string[]): string {
  const coreList  = major === 'IF' ? CORE_IF : CORE_CS
  const pathList  = aiPath === 'nlp' ? NLP_COURSES : CV_COURSES
  const pathName  = aiPath === 'nlp'
    ? 'AI / NLP (Doğal Dil İşleme)'
    : 'AI / Computer Vision (Görüntü İşleme)'

  const missingCore = coreList.filter(c => !selected.includes(c))
  const missingPath = pathList.filter(c => !selected.includes(c))
  const missingBS   = BASIC_SCI.filter(c => !selected.includes(c))

  const coreSection = missingCore.length === 0
    ? '✅ Tüm core dersler tamamlanmış!'
    : `Eksik core dersler (öncelikli):\n${missingCore.slice(0, 3).map(c => `- **${c}**`).join('\n')}`

  const pathSection = missingPath.length === 0
    ? '✅ Path tamamlanmış!'
    : `Almanız önerilen path dersleri:\n${missingPath.slice(0, 4).map(c => `- **${c}**`).join('\n')}`

  const bsSection = missingBS.length === 0
    ? '✅ Temel bilim dersleri tamam!'
    : `Eksik temel bilim: ${missingBS.slice(0, 2).join(', ')}`

  const pathTip = aiPath === 'nlp'
    ? '💡 **CS412 (Machine Learning)** bu path\'in temelidir — önce bunu alın. Ardından **VS445 (NLP)** ve **CS464** gelebilir.'
    : '💡 **EE417 (Computer Vision)** ile başlayın, ardından **CS484** ve **CS585** ile devam edin.'

  return `## Mezuniyet Analizi — ${major}

Seçtiğiniz **${selected.length} ders** baz alınarak hazırlandı.

---

### Core Dersler
${coreSection}

### ${pathName} Path
${pathSection}

### Temel Bilim
${bsSection}

---

${pathTip}

Başka sorunuz varsa veya listeyi güncellemek isterseniz "Dersleri düzenle" deyin.`
}

function buildPlanReply(major: string, aiPath: 'nlp' | 'cv' | null, selected: string[]): string {
  const pathList = aiPath === 'nlp' ? NLP_COURSES : aiPath === 'cv' ? CV_COURSES : []
  const coreList = major === 'IF' ? CORE_IF : CORE_CS

  const nextCore = coreList.filter(c => !selected.includes(c)).slice(0, 2)
  const nextPath = pathList.filter(c => !selected.includes(c)).slice(0, 2)
  const nextBS   = BASIC_SCI.filter(c => !selected.includes(c)).slice(0, 1)
  const nextFree = FREE_NICE.filter(c => !selected.includes(c)).slice(0, 2)

  const recommend = [
    ...nextCore.map(c => `- **${c}** ← Core zorunlu`),
    ...nextPath.map(c => `- **${c}** ← ${aiPath === 'nlp' ? 'NLP' : 'CV'} path`),
    ...nextBS.map(c => `- **${c}** ← Temel bilim`),
    ...nextFree.map(c => `- **${c}** ← Serbest seçmeli / rahatlatıcı`),
  ]

  const altNote = aiPath === 'nlp'
    ? '🔄 Ders yükünü hafifletmek için **ENS211** yerine **CS310**, **MATH306** yerine **ACC101** alabilirsiniz.'
    : '🔄 Ders yükünü hafifletmek için seçmeli derslerden birini erteleyebilirsiniz.'

  return `## Bu Dönem Ders Önerileri — ${major}

**${selected.length} tamamlanmış ders** görüyorum. Bu döneme şunları öneriyorum:

${recommend.join('\n')}

---

${altNote}

Serbest seçmelileri dolduracak rahat bir döneminiz olursa **HUM** veya **SPS** derslerinden birini ekleyebilirsiniz.

Beğenmediğiniz bir ders var mı, değiştirelim mi?`
}

function buildPathReply(aiPath: 'nlp' | 'cv', selected: string[]): string {
  const pathList = aiPath === 'nlp' ? NLP_COURSES : CV_COURSES
  const pathName = aiPath === 'nlp' ? 'NLP (Doğal Dil İşleme)' : 'Computer Vision'
  const done     = pathList.filter(c => selected.includes(c))
  const missing  = pathList.filter(c => !selected.includes(c))
  const pct      = Math.round((done.length / pathList.length) * 100)

  const tip = aiPath === 'nlp'
    ? 'Bu path için **CS412 → VS445 → CS464** sırasıyla ilerlemeniz önerilir. CS412 önkoşul gerektiriyor, kontrol edin.'
    : 'Bu path için **EE417 → CS484 → CS585** sırası önerilir. EE417 önkoşulsuz başlanabilir.'

  return `## AI Path Analizi — ${pathName}

Path tamamlanma: **%${pct}** (${done.length}/${pathList.length} ders)

${done.length > 0 ? `✅ Tamamlanan:\n${done.map(c => `- ${c}`).join('\n')}\n` : ''}
${missing.length > 0 ? `📋 Kalan dersler:\n${missing.map(c => `- **${c}**`).join('\n')}` : '✅ Path tamamlandı!'}

---

${tip}`
}

// ─── Simüle stream (wizard cevapları için) ─────────────────────────────────────

async function streamText(text: string, onChunk: (c: string) => void) {
  for (let i = 0; i < text.length; i++) {
    onChunk(text[i])
    // Her 8 karakterde bir kısa bekleme (akıcı görünüm)
    if (i % 8 === 0) await new Promise(r => setTimeout(r, 12))
  }
}

// ─── ChatWindow ────────────────────────────────────────────────────────────────

export function ChatWindow() {
  const { messages, isStreaming, addMessage, appendToLast, setStreaming, clearMessages } = useChatStore()
  const { token, studentId, major: authMajor } = useAuthStore()
  const { selectedCourses, isComplete, markComplete } = useCourseSelectionStore()

  const [input, setInput]           = useState('')
  const [wizard, setWizard]         = useState<WizardData>(INITIAL_WIZARD)
  const [showPanel, setShowPanel]   = useState(false)   // course selector panel
  const bottomRef                   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, wizard.step])

  // ── Serbest soru gönder ─────────────────────────────────────────────────────
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
    } catch (err) {
      appendToLast(`\n\n[Hata: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}]`)
    } finally {
      setStreaming(false)
    }
  }, [isStreaming, token, studentId, authMajor, selectedCourses, addMessage, appendToLast, setStreaming])

  // ── Wizard cevabını simüle stream et ────────────────────────────────────────
  const streamWizardReply = useCallback(async (text: string) => {
    addMessage({ role: 'assistant', content: '' })
    setStreaming(true)
    await streamText(text, appendToLast)
    setStreaming(false)
  }, [addMessage, appendToLast, setStreaming])

  // ── Wizard başlatıcılar ─────────────────────────────────────────────────────
  const startGraduationWizard = useCallback(() => {
    if (isStreaming) return
    clearMessages()
    addMessage({
      role: 'assistant',
      content: 'Merhaba! Mezuniyet durumunu analiz etmek için birkaç soru soracağım.\n\nÖnce: **ne okuyorsunuz?**',
      isWizard: true,
    })
    setWizard({ type: 'graduation', step: 'major-select', major: '', aiPath: null })
  }, [isStreaming, clearMessages, addMessage])

  const startPlanWizard = useCallback(() => {
    if (isStreaming) return
    // Dersler zaten seçiliyse direkt öneri sun
    if (isComplete && selectedCourses.length > 0) {
      clearMessages()
      addMessage({ role: 'user', content: 'Bu dönem ne almalıyım?' })
      addMessage({
        role: 'assistant',
        content: 'Daha önce seçtiğin **' + selectedCourses.length + ' ders** görüyorum. AI ilgi alanını hatırlatır mısın?',
        isWizard: true,
      })
      setWizard({ type: 'plan', step: 'ai-path-select', major: authMajor, aiPath: null })
      return
    }
    clearMessages()
    addMessage({
      role: 'assistant',
      content: 'Bu dönem için öneri yapabilmem için hangi dersleri aldığını öğrenmem gerek.\n\nÖnce bölümünü seçelim:',
      isWizard: true,
    })
    setWizard({ type: 'plan', step: 'major-select', major: '', aiPath: null })
  }, [isStreaming, isComplete, selectedCourses, authMajor, clearMessages, addMessage])

  const startPathWizard = useCallback(() => {
    if (isStreaming) return
    clearMessages()
    addMessage({
      role: 'assistant',
      content: 'AI alanında hangi konuya daha çok ilgi duyuyorsun?',
      isWizard: true,
    })
    setWizard({ type: 'path', step: 'ai-path-select', major: authMajor, aiPath: null })
  }, [isStreaming, authMajor, clearMessages, addMessage])

  // ── Wizard adım seçim handler ───────────────────────────────────────────────
  const handleWizardSelect = useCallback(async (payload: {
    major?: string
    aiPath?: 'nlp' | 'cv'
    coursesDone?: boolean
  }) => {
    if (isStreaming) return
    const { type, step, major: wMajor } = wizard

    // — Major seçimi —
    if (step === 'major-select' && payload.major) {
      const m = payload.major
      addMessage({ role: 'user', content: `${m} — ${MAJOR_LABELS[m] ?? m}` })

      if (isComplete && selectedCourses.length > 0) {
        // Dersler zaten var → ai-path
        addMessage({
          role: 'assistant',
          content: `Daha önce **${selectedCourses.length} ders** seçmiştin. AI ilgi alanın ne?`,
          isWizard: true,
        })
        setWizard(prev => ({ ...prev, major: m, step: 'ai-path-select' }))
      } else {
        // Ders seçtir
        addMessage({
          role: 'assistant',
          content: `**${m}** bölümünden hangi dersleri aldın? Sağdaki paneli kullanarak seç, sonra "Kaydet" e bas.`,
          isWizard: true,
        })
        setWizard(prev => ({ ...prev, major: m, step: 'course-select' }))
        setShowPanel(true)
      }
    }

    // — Ders seçimi tamamlandı —
    if (step === 'course-select' && payload.coursesDone) {
      markComplete()
      setShowPanel(false)
      addMessage({
        role: 'user',
        content: `${selectedCourses.length} ders seçildi (${selectedCourses.slice(0, 4).join(', ')}${selectedCourses.length > 4 ? '…' : ''})`,
      })
      addMessage({
        role: 'assistant',
        content: 'Harika! AI alanında hangi konuya ilgin var?',
        isWizard: true,
      })
      setWizard(prev => ({ ...prev, step: 'ai-path-select' }))
    }

    // — AI path seçimi —
    if (step === 'ai-path-select' && payload.aiPath) {
      const path = payload.aiPath
      const pathLabel = path === 'nlp' ? 'NLP / Doğal Dil İşleme' : 'Computer Vision / Görüntü İşleme'
      addMessage({ role: 'user', content: pathLabel })
      setWizard(prev => ({ ...prev, aiPath: path, step: 'sending' }))

      let reply = ''
      if (type === 'graduation') {
        reply = buildGraduationReply(wMajor || authMajor, path, selectedCourses)
      } else if (type === 'plan') {
        reply = buildPlanReply(wMajor || authMajor, path, selectedCourses)
      } else {
        reply = buildPathReply(path, selectedCourses)
      }

      await streamWizardReply(reply)
      setWizard(INITIAL_WIZARD)
    }
  }, [isStreaming, wizard, isComplete, selectedCourses, authMajor, addMessage, markComplete, streamWizardReply])

  // ── Enter gönder ────────────────────────────────────────────────────────────
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim()) {
        setWizard(INITIAL_WIZARD)   // serbest soru wizard'ı iptal eder
        sendRag(input)
        setInput('')
      }
    }
  }

  const handleSend = () => {
    if (input.trim()) {
      setWizard(INITIAL_WIZARD)
      sendRag(input)
      setInput('')
    }
  }

  // ── Course panel kaydet ─────────────────────────────────────────────────────
  const handlePanelSave = useCallback(() => {
    handleWizardSelect({ coursesDone: true })
  }, [handleWizardSelect])

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-4">
      {/* ── Sol: Hızlı sorular ────────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col gap-2 w-52 shrink-0">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-1 px-1">Hızlı Sorular</p>

        <QuickBtn
          label="Mezuniyet durumum nedir?"
          icon="🎓"
          disabled={isStreaming}
          onClick={startGraduationWizard}
        />
        <QuickBtn
          label="Bu dönem ne almalıyım?"
          icon="📅"
          disabled={isStreaming}
          onClick={startPlanWizard}
        />
        <QuickBtn
          label="AI path önerileri"
          icon="🤖"
          disabled={isStreaming}
          onClick={startPathWizard}
        />

        {/* Ders paneli toggle */}
        <div className="mt-3 border-t border-white/10 pt-3">
          <button
            onClick={() => setShowPanel(v => !v)}
            className={cn(
              'w-full flex items-center gap-2 glass rounded-2xl px-3 py-2.5 text-sm transition-all',
              showPanel ? 'text-su-300 bg-su-500/20 border border-su-300/30' : 'text-white/60 hover:text-white glass-hover',
            )}
          >
            <span>📚</span>
            <span className="flex-1 text-left text-xs">Aldığım Dersler</span>
            <span className="text-[10px] bg-su-500/30 text-su-300 rounded-full px-1.5 py-0.5">
              {selectedCourses.length}
            </span>
          </button>
          {selectedCourses.length > 0 && (
            <p className="text-[10px] text-white/25 text-center mt-1">{selectedCourses.length} ders kayıtlı</p>
          )}
        </div>

        <div className="mt-auto">
          <button
            onClick={clearMessages}
            className="w-full text-xs text-white/30 hover:text-white/60 transition-colors py-2"
          >
            Sohbeti temizle
          </button>
        </div>
      </div>

      {/* ── Orta: Chat alanı ──────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 glass rounded-[28px] overflow-hidden min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-16">
              <div className="w-16 h-16 rounded-full glass flex items-center justify-center text-3xl">🎓</div>
              <p className="text-white/60 text-sm max-w-xs">
                Sol panelden bir konu seç ya da direkt soru sor.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* ── Wizard adım kartları ─────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {wizard.step === 'major-select' && (
              <WizardCard key="major">
                <p className="text-xs text-white/50 mb-3">Bölümünüzü seçin:</p>
                <div className="flex flex-wrap gap-2">
                  {MAJORS.map(m => (
                    <button
                      key={m}
                      onClick={() => handleWizardSelect({ major: m })}
                      className="glass glass-hover rounded-xl px-3 py-1.5 text-xs text-white/80 hover:text-white transition-all"
                    >
                      <span className="font-bold text-su-300">{m}</span>
                      <span className="text-white/40 ml-1">{MAJOR_LABELS[m]}</span>
                    </button>
                  ))}
                </div>
              </WizardCard>
            )}

            {wizard.step === 'course-select' && !showPanel && (
              <WizardCard key="coursePrompt">
                <p className="text-xs text-white/50 mb-2">
                  Sağ panelde <span className="text-su-300 font-semibold">{wizard.major}</span> derslerini seçin.
                </p>
                <button
                  onClick={() => setShowPanel(true)}
                  className="text-xs px-3 py-1.5 rounded-xl bg-su-500/20 border border-su-300/30 text-su-300 hover:bg-su-500/30 transition-all"
                >
                  📚 Paneli aç
                </button>
              </WizardCard>
            )}

            {wizard.step === 'course-select' && showPanel && (
              <WizardCard key="courseDone">
                <p className="text-xs text-white/50 mb-2">
                  <span className="text-su-300 font-semibold">{selectedCourses.length} ders</span> seçildi.
                  Tamamladığında kaydet butonuna bas.
                </p>
                <button
                  onClick={handlePanelSave}
                  disabled={selectedCourses.length === 0}
                  className="text-xs px-3 py-1.5 rounded-xl bg-su-500 text-white hover:bg-su-300 disabled:opacity-30 transition-all"
                >
                  Devam et →
                </button>
              </WizardCard>
            )}

            {wizard.step === 'ai-path-select' && (
              <WizardCard key="aiPath">
                <p className="text-xs text-white/50 mb-3">AI alanında ilgi konunuz:</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleWizardSelect({ aiPath: 'nlp' })}
                    className="glass glass-hover rounded-xl px-4 py-2 text-sm text-white/80 hover:text-white flex items-center gap-2"
                  >
                    <span>🧠</span>
                    <div className="text-left">
                      <p className="text-xs font-semibold">NLP</p>
                      <p className="text-[10px] text-white/40">Doğal Dil İşleme</p>
                    </div>
                  </button>
                  <button
                    onClick={() => handleWizardSelect({ aiPath: 'cv' })}
                    className="glass glass-hover rounded-xl px-4 py-2 text-sm text-white/80 hover:text-white flex items-center gap-2"
                  >
                    <span>👁</span>
                    <div className="text-left">
                      <p className="text-xs font-semibold">Computer Vision</p>
                      <p className="text-[10px] text-white/40">Görüntü İşleme</p>
                    </div>
                  </button>
                </div>
              </WizardCard>
            )}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>

        {/* ── Input ─────────────────────────────────────────────────────────── */}
        <div className="border-t border-white/10 p-3 flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={isStreaming}
            rows={1}
            placeholder="Bir şey sor… (Enter göndermek için)"
            className={cn(
              'flex-1 bg-transparent text-white placeholder-white/30 text-sm resize-none outline-none',
              'max-h-28 overflow-y-auto leading-relaxed',
            )}
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
            className="w-9 h-9 rounded-full bg-su-500 hover:bg-su-300 disabled:opacity-30 flex items-center justify-center shrink-0 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" />
            </svg>
          </motion.button>
        </div>
      </div>

      {/* ── Sağ: Course Selection Panel ───────────────────────────────────────── */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 320 }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="shrink-0 glass rounded-[28px] overflow-hidden flex flex-col"
            style={{ minWidth: 0 }}
          >
            <CourseSelector
              initialMajor={wizard.major || authMajor}
              onSave={handlePanelSave}
              onClose={() => setShowPanel(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Küçük yardımcı bileşenler ─────────────────────────────────────────────────

function QuickBtn({ label, icon, disabled, onClick }: {
  label: string; icon: string; disabled: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="glass glass-hover rounded-2xl px-3 py-2.5 text-left text-sm text-white/80 hover:text-white disabled:opacity-40 transition-all flex items-start gap-2"
    >
      <span className="text-base shrink-0 mt-0.5">{icon}</span>
      <span className="text-xs leading-snug">{label}</span>
    </button>
  )
}

function WizardCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="self-start max-w-sm"
    >
      <div className="glass rounded-2xl px-4 py-3 border border-su-300/20">
        {children}
      </div>
    </motion.div>
  )
}
