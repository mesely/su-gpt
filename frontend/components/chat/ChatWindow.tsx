'use client'
import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageBubble } from './MessageBubble'
import { CourseSelector } from './CourseSelector'
import { useChatStore, useAuthStore, useCourseSelectionStore } from '@/lib/store'
import { api, Course } from '@/lib/api'
import { cn } from '@/lib/utils'

// IF is not a real major — it's a pool of required courses.
// Only real degree-granting majors listed here.
const MAJOR_LABELS: Record<string, string> = {
  CS:   'Bilgisayar Bilimi',
  EE:   'Elektrik-Elektronik',
  ME:   'Makine Muh.',
  IE:   'Endustri Muh.',
  MAT:  'Matematik',
  BIO:  'Biyoloji',
  ECON: 'Ekonomi',
}

const MAJORS = Object.keys(MAJOR_LABELS)

type WizardType = 'graduation' | 'plan' | 'path' | null
type WizardStep =
  | 'major-select'
  | 'course-select'
  | 'profile-select'
  | 'track-select'
  | 'difficulty-select'
  | 'sending'
  | null
type IntentType = 'graduation' | 'plan' | 'path' | null
type Difficulty = 'easy' | 'balanced' | 'hard' | null

interface WizardData {
  type: WizardType
  step: WizardStep
  major: string
  selectedTracks: string[]
  profileTags: string[]
  difficulty: Difficulty
}

const INITIAL_WIZARD: WizardData = {
  type: null,
  step: null,
  major: '',
  selectedTracks: [],
  profileTags: [],
  difficulty: null,
}

interface TrackOption {
  id: string
  label: string
  description: string
  courses: string[]
  tags: string[]
}

const COMMON_TRACKS: TrackOption[] = [
  {
    id: 'ai_general',
    label: 'AI / Data',
    description: 'Modelleme, veri ve uygulama odakli yol.',
    courses: ['CS412', 'MATH203', 'MATH204', 'ECON201'],
    tags: ['math', 'ml', 'analysis'],
  },
  {
    id: 'product',
    label: 'Product & Analytics',
    description: 'Urun, metrik ve is odakli teknik yon.',
    courses: ['IF100', 'ECON201', 'SPS303', 'CS306'],
    tags: ['product', 'analysis', 'business'],
  },
  {
    id: 'systems',
    label: 'Systems',
    description: 'Sistem, performans ve altyapi agirlikli.',
    courses: ['CS307', 'CS403', 'CS405', 'EE202'],
    tags: ['systems', 'hardware', 'coding'],
  },
  {
    id: 'design_tech',
    label: 'Design + Tech',
    description: 'Yaraticilik ve teknoloji kesisimi.',
    courses: ['HUM312', 'VACD201', 'CS306', 'SPS303'],
    tags: ['design', 'product', 'coding'],
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Teorik derinlik ve proje odakli gelisim.',
    courses: ['MATH306', 'ENS491', 'ENS492', 'CS301'],
    tags: ['math', 'analysis', 'research'],
  },
]

const MAJOR_TRACKS: Record<string, TrackOption[]> = {
  CS: [
    {
      id: 'ai_nlp',
      label: 'AI - NLP',
      description: 'Dogal dil isleme, LLM ve metin madenciligi.',
      courses: ['CS412', 'CS415', 'CS445', 'CS455'],
      tags: ['ml', 'coding', 'analysis'],
    },
    {
      id: 'ai_cv',
      label: 'AI - Computer Vision',
      description: 'Goruntu isleme, derin ogrenme ve algi.',
      courses: ['CS419', 'CS415', 'CS412', 'MATH203'],
      tags: ['ml', 'math', 'coding'],
    },
    {
      id: 'fullstack',
      label: 'Full Stack Engineer',
      description: 'Backend + frontend + yazilim muhendisligi.',
      courses: ['CS306', 'CS308', 'CS405', 'CS412', 'CS403'],
      tags: ['coding', 'product', 'systems'],
    },
    {
      id: 'crypto',
      label: 'Kriptografi / Guvenlik',
      description: 'Guvenli sistemler, protokoller ve teori.',
      courses: ['CS411', 'CS432', 'CS437', 'CS438', 'MATH306'],
      tags: ['math', 'systems', 'coding'],
    },
    {
      id: 'data_eng',
      label: 'Data Engineering',
      description: 'Veri tabani, pipeline, dagitik sistem.',
      courses: ['CS306', 'CS307', 'CS405', 'IE301'],
      tags: ['systems', 'analysis', 'coding'],
    },
    {
      id: 'control_cs',
      label: 'Control & Robotics',
      description: 'Kontrol, gomulu ve robotik baglantisi.',
      courses: ['ENS206', 'ENS202', 'ME403', 'CS412'],
      tags: ['hardware', 'math', 'coding'],
    },
  ],
  IE: [
    {
      id: 'ie_analytics',
      label: 'Analytics',
      description: 'Veri analizi ve karar destek.',
      courses: ['IE305', 'IE311', 'MATH203', 'CS412'],
      tags: ['analysis', 'math', 'business'],
    },
    {
      id: 'ie_optimization',
      label: 'Optimization',
      description: 'Modelleme ve optimizasyon agirlikli.',
      courses: ['IE302', 'IE311', 'IE313', 'MATH306'],
      tags: ['math', 'analysis', 'research'],
    },
    {
      id: 'ie_supply',
      label: 'Supply Chain',
      description: 'Lojistik, planlama ve operasyon.',
      courses: ['IE305', 'IE311', 'IE313', 'ECON201'],
      tags: ['business', 'analysis', 'product'],
    },
    {
      id: 'ie_control',
      label: 'Control Path',
      description: 'IE + kontrol/sistem hibriti.',
      courses: ['ENS206', 'ENS202', 'IE305', 'ME301'],
      tags: ['math', 'hardware', 'systems'],
    },
    {
      id: 'ie_product',
      label: 'Product Operations',
      description: 'Urun-karar-metrik odakli teknik yon.',
      courses: ['IE305', 'CS306', 'SPS303', 'IF201'],
      tags: ['product', 'business', 'analysis'],
    },
  ],
  ME: [
    {
      id: 'me_control',
      label: 'Control Systems',
      description: 'Kontrol teorisi ve dinamik sistemler.',
      courses: ['ENS206', 'ME301', 'MATH212', 'MATH203'],
      tags: ['math', 'hardware', 'systems'],
    },
    {
      id: 'me_robotics',
      label: 'Robotics',
      description: 'Mekatronik, algi, kontrol.',
      courses: ['ME403', 'ME409', 'ENS206', 'CS412'],
      tags: ['hardware', 'coding', 'systems'],
    },
    {
      id: 'me_energy',
      label: 'Energy / Thermal',
      description: 'Enerji sistemleri ve termal analiz.',
      courses: ['ENS202', 'ME307', 'MATH203', 'PHYS113'],
      tags: ['math', 'analysis', 'research'],
    },
    {
      id: 'me_design',
      label: 'Mechanical Design',
      description: 'Tasarim, imalat ve urun gelistirme.',
      courses: ['ME301', 'ME302', 'ME415', 'ENS492'],
      tags: ['design', 'product', 'hardware'],
    },
    {
      id: 'me_manufacturing',
      label: 'Manufacturing',
      description: 'Uretim sistemleri ve proses iyilestirme.',
      courses: ['ME302', 'ME415', 'IE305', 'IE311'],
      tags: ['systems', 'business', 'analysis'],
    },
  ],
  EE: [
    {
      id: 'ee_embedded',
      label: 'Embedded Systems',
      description: 'Gomulu yazilim ve donanim butunlugu.',
      courses: ['EE302', 'EE303', 'CS307', 'CS310'],
      tags: ['hardware', 'coding', 'systems'],
    },
    {
      id: 'ee_signal',
      label: 'Signals & DSP',
      description: 'Sinyal isleme ve matematiksel modelleme.',
      courses: ['EE311', 'EE312', 'MATH203', 'CS412'],
      tags: ['math', 'analysis', 'hardware'],
    },
    {
      id: 'ee_control',
      label: 'Control Path',
      description: 'Kontrol, otomasyon ve sistem tasarimi.',
      courses: ['ENS206', 'EE311', 'MATH212', 'ME301'],
      tags: ['math', 'systems', 'hardware'],
    },
    {
      id: 'ee_power',
      label: 'Power Systems',
      description: 'Enerji ve guc sistemleri yonu.',
      courses: ['EE410', 'EE408', 'MATH203', 'PHYS113'],
      tags: ['hardware', 'analysis', 'research'],
    },
    {
      id: 'ee_ai_hardware',
      label: 'AI on Hardware',
      description: 'AI algoritmalarinin donanim uygulamasi.',
      courses: ['CS412', 'EE404', 'EE473', 'CS403'],
      tags: ['ml', 'hardware', 'coding'],
    },
  ],
}

// Career / grad school info per track
const TRACK_CAREER: Record<string, { jobs: string[]; grad: string[] }> = {
  ai_nlp:         { jobs: ['NLP Muhendisi', 'LLM Uygulama Muhendisi', 'ML Arastirma Muhendisi', 'AI Urun Yoneticisi'], grad: ['CS MSc (NLP)', 'Yapay Zeka MSc', 'Hesaplamali Dilbilim MSc', 'Yapay Zeka PhD'] },
  ai_cv:          { jobs: ['Computer Vision Muhendisi', 'Goruntu Isleme Uzmani', 'Algilama/Otonomi Muhendisi', 'Medikal Goruntuleme Uzmani'], grad: ['Computer Vision MSc', 'Robotik MSc', 'EE MSc', 'Computer Vision PhD'] },
  fullstack:      { jobs: ['Full Stack Gelistirici', 'Backend Muhendisi', 'Frontend Muhendisi', 'Urun Odakli Yazilim Muhendisi'], grad: ['Yazilim Muhendisligi MSc', 'CS MSc', 'MBA (Teknoloji)'] },
  crypto:         { jobs: ['Siber Guvenlik Muhendisi', 'Kriptografi Arastirma Muhendisi', 'Guvenlik Analisti', 'Blockchain Guvenlik Gelistiricisi'], grad: ['Siber Guvenlik MSc', 'Bilgi Guvenligi MSc', 'Kriptografi PhD'] },
  data_eng:       { jobs: ['Veri Muhendisi', 'MLOps Muhendisi', 'Data Platform Muhendisi', 'Analitik Muhendisi'], grad: ['Veri Bilimi MSc', 'CS MSc', 'Bilgi Sistemleri MSc', 'Veri Muhendisligi PhD'] },
  control_cs:     { jobs: ['Kontrol Sistemleri Muhendisi', 'Robotik Yazilim Muhendisi', 'Otomasyon Muhendisi', 'Mekatronik Gelistirici'], grad: ['Kontrol Teorisi MSc', 'Robotik MSc', 'Mekatronik MSc', 'Robotik PhD'] },
  ie_analytics:   { jobs: ['Veri Analisti', 'Is Zekasi Uzmani', 'Analitik Danisman', 'Fintech Analisti'], grad: ['Endustri Muh. MSc', 'Veri Bilimi MSc', 'Is Analitigi MSc', 'Yoneylem Arastirmasi PhD'] },
  ie_optimization:{ jobs: ['Operasyon Arastirmasi Uzmani', 'Optimizasyon Muhendisi', 'Karar Destek Uzmani', 'Planlama Muhendisi'], grad: ['Yoneylem Arastirmasi MSc', 'Endustri Muh. MSc', 'OR PhD'] },
  ie_supply:      { jobs: ['Tedarik Zinciri Analisti', 'Lojistik Planlama Uzmani', 'Operasyon Yoneticisi', 'Satinalma Analisti'], grad: ['Supply Chain MSc', 'MBA (Operations)', 'Endustri Muh. MSc'] },
  ie_control:     { jobs: ['Otomasyon Muhendisi', 'Proses Kontrol Uzmani', 'Endustriyel IoT Muhendisi'], grad: ['Kontrol Muh. MSc', 'Mekatronik MSc', 'Kontrol PhD'] },
  ie_product:     { jobs: ['Urun Yoneticisi', 'Teknik Proje Yoneticisi', 'Is Gelistirme Uzmani', 'Strateji Danismani'], grad: ['MBA', 'Urun Yonetimi MSc', 'Isletme MSc'] },
  me_control:     { jobs: ['Kontrol Sistemleri Muhendisi', 'Surec Muhendisi', 'Otomasyon Uzmani'], grad: ['Kontrol Teorisi MSc', 'Makine Muh. MSc', 'Kontrol PhD'] },
  me_robotics:    { jobs: ['Robotik Muhendisi', 'Mekatronik Muhendisi', 'Otonom Sistem Muhendisi'], grad: ['Robotik MSc', 'Mekatronik MSc', 'Makine Muh. MSc', 'Robotik PhD'] },
  me_energy:      { jobs: ['Enerji Muhendisi', 'Termal Sistem Muhendisi', 'Yenilenebilir Enerji Uzmani'], grad: ['Enerji Sistemleri MSc', 'Makine Muh. MSc (Termal)', 'Enerji PhD'] },
  me_design:      { jobs: ['Mekanik Tasarim Muhendisi', 'Urun Gelistirme Muhendisi', 'CAD/CAM Uzmani'], grad: ['Makine Muh. MSc (Tasarim)', 'Urun Tasarimi MSc'] },
  me_manufacturing:{ jobs: ['Uretim Muhendisi', 'Kalite Guvence Uzmani', 'Proses Iyilestirme Muhendisi'], grad: ['Imalat Muh. MSc', 'Endustri Muh. MSc'] },
  ee_embedded:    { jobs: ['Gomulu Sistemler Muhendisi', 'Firmware Muhendisi', 'IoT Muhendisi'], grad: ['Gomulu Sistemler MSc', 'EE MSc', 'Gomulu Sistemler PhD'] },
  ee_signal:      { jobs: ['DSP Muhendisi', 'Sinyal Isleme Uzmani', 'Goruntu/Ses Isleme Muhendisi'], grad: ['Sinyal Isleme MSc', 'EE MSc', 'DSP PhD'] },
  ee_control:     { jobs: ['Kontrol Muhendisi', 'Otomasyon Muhendisi', 'Sistem Modelleme Uzmani'], grad: ['Kontrol Teorisi MSc', 'EE MSc', 'Kontrol PhD'] },
  ee_power:       { jobs: ['Guc Sistemleri Muhendisi', 'Enerji Sistemleri Danismani', 'Elektrik Dagitim Uzmani'], grad: ['Guc Sistemleri MSc', 'Enerji Muh. MSc', 'Power Systems PhD'] },
  ee_ai_hardware: { jobs: ['Edge AI Muhendisi', 'FPGA Muhendisi', 'AI Donanim Gelistiricisi'], grad: ['EE/CS MSc (AI Donanim)', 'Computer Architecture MSc', 'Hardware for AI PhD'] },
  ai_general:     { jobs: ['ML Muh.', 'Veri Bilimcisi', 'AI Arastirmacisi', 'AI PM'], grad: ['Yapay Zeka MSc/PhD', 'Veri Bilimi MSc', 'CS MSc'] },
  product:        { jobs: ['Urun Yoneticisi', 'Growth Analisti', 'Startup Kurucusu', 'Dijital Strateji Danismani'], grad: ['MBA', 'Urun Yonetimi MSc', 'Teknoloji Yonetimi MSc'] },
  systems:        { jobs: ['Platform Muh.', 'Site Reliability Eng.', 'DevOps Muh.', 'Altyapi Mimari'], grad: ['Dagitik Sistemler MSc', 'CS MSc'] },
  design_tech:    { jobs: ['UX Muh.', 'Kreatif Teknoloji Uzm.', 'Etkilesim Tasarimcisi'], grad: ['HCI MSc', 'Tasarim MSc', 'Medya Sanatlari MSc'] },
  research:       { jobs: ['Arastirmaci (Akademik/Endustriyel)', 'AR-GE Proje Yoneticisi', 'Danisman'], grad: ['Herhangi bir MSc → PhD', 'Akademik kariyer'] },
  undecided:      { jobs: ['Yazilim Gelistirici', 'Analitik Danisman', 'Teknoloji Uzmani'], grad: ['Ilgi alaniniza gore MSc secilebilir'] },
}

const PROFILE_OPTIONS = [
  { id: 'coding',   label: 'Kod yazmayi seviyorum' },
  { id: 'math',     label: 'Matematik/modelleme seviyorum' },
  { id: 'analysis', label: 'Veri analizi ilgimi cekiyor' },
  { id: 'systems',  label: 'Sistem/altyapi ilgimi cekiyor' },
  { id: 'hardware', label: 'Donanim/robotik ilgimi cekiyor' },
  { id: 'product',  label: 'Urun/insan odakli seyler seviyorum' },
  { id: 'design',   label: 'Tasarim/yaratici isler seviyorum' },
  { id: 'business', label: 'Isletme/yonetim tarafi ilgimi cekiyor' },
]

const MAJOR_CORE_HINTS: Record<string, string[]> = {
  CS:  ['IF100', 'CS201', 'CS204', 'CS300', 'CS301', 'CS306', 'MATH203', 'MATH204', 'ENS491', 'ENS492'],
  IE:  ['IF100', 'MATH203', 'MATH204', 'IE305', 'IE311'],
  EE:  ['IF100', 'MATH203', 'MATH212', 'EE302', 'EE311'],
  ME:  ['IF100', 'MATH203', 'MATH212', 'ME301', 'ME302'],
  BIO: ['IF100', 'BIO301', 'BIO303', 'BIO321', 'BIO332'],
}

const SUPPORTER_COURSES: Record<Exclude<Difficulty, null>, string[]> = {
  easy:     ['SPS303', 'HUM201'],
  balanced: ['SPS303', 'ECON201'],
  hard:     ['MATH306', 'ENS211'],
}

function detectIntent(question: string): IntentType {
  const q = question.toLowerCase().trim()
  if (!q) return null
  if (q.includes('mezuniyet') || q.includes('eksik ders') || q.includes('graduation')) return 'graduation'
  if (q.includes('bu donem') || q.includes('ne almaliyim') || q.includes('plan')) return 'plan'
  if (q.includes('hangi alanda') || q.includes('path') || q.includes('alan') || q.includes('ilerlemeliyim')) return 'path'
  return null
}

function shortCourse(code: string, map: Map<string, Course>) {
  const c = map.get(code)
  if (!c) return `- **${code}**`
  const name = c.name && c.name.trim() ? c.name : code
  return `- **${code}** — ${name}`
}

function normalizeCategories(status: unknown) {
  const payload = status as Record<string, unknown>
  if (Array.isArray(payload.categoryStatuses)) {
    return payload.categoryStatuses
      .map((raw) => raw as Record<string, unknown>)
      .map((c) => ({
        key: String(c.category ?? 'unknown'),
        completed: Number(c.completedEcts ?? 0),
        required: Number(c.requiredEcts ?? 0),
        missingCourses: Array.isArray(c.missingCourses) ? (c.missingCourses as string[]) : [],
      }))
  }
  if (payload.categories && typeof payload.categories === 'object') {
    return Object.entries(payload.categories as Record<string, Record<string, unknown>>).map(([key, value]) => ({
      key,
      completed: Number(value.completed ?? 0),
      required:  Number(value.required ?? 0),
      missingCourses: Array.isArray(value.courses) ? (value.courses as string[]) : [],
    }))
  }
  return []
}

function getTrackOptions(major: string): TrackOption[] {
  const list = MAJOR_TRACKS[major] ?? COMMON_TRACKS
  return [
    ...list,
    {
      id: 'undecided',
      label: 'Kararsizim',
      description: 'Dengeli bir kesif yolu: temel + farkli alanlardan secmeli.',
      courses: ['SPS303', 'ECON201', 'CS306', 'MATH203'],
      tags: ['analysis', 'product'],
    },
  ]
}

function rankTracksByProfile(major: string, profileTags: string[]): TrackOption[] {
  const options = getTrackOptions(major)
  if (profileTags.length === 0) return options
  return [...options].sort((a, b) => {
    const scoreA = a.tags.filter((t) => profileTags.includes(t)).length
    const scoreB = b.tags.filter((t) => profileTags.includes(t)).length
    if (scoreB !== scoreA) return scoreB - scoreA
    return a.label.localeCompare(b.label)
  })
}

async function streamText(text: string, onChunk: (c: string) => void) {
  for (let i = 0; i < text.length; i++) {
    onChunk(text[i])
    if (i % 8 === 0) await new Promise((r) => setTimeout(r, 7))
  }
}

export function ChatWindow() {
  const {
    activeSessionId,
    newSession,
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
  const [coursePanelCategory, setCoursePanelCategory] = useState<'all' | 'core' | 'area' | 'basicScience' | 'free' | 'university'>('all')
  const [courseMap, setCourseMap] = useState<Map<string, Course>>(new Map())
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, wizard.step])

  useEffect(() => {
    if (!activeSessionId) newSession()
  }, [activeSessionId, newSession])

  const hydrateCourses = useCallback(async (codes: string[]) => {
    if (!token || codes.length === 0) return courseMap
    const map = new Map(courseMap)
    const needs = codes.filter((c) => c && !map.has(c))
    if (needs.length === 0) return map
    await Promise.all(needs.map(async (code) => {
      try {
        const c = await api.getCourse(token, code)
        map.set(c.fullCode, c)
      } catch { /* ignore */ }
    }))
    setCourseMap(map)
    return map
  }, [token, courseMap])

  const streamWizardReply = useCallback(async (text: string) => {
    addMessage({ role: 'assistant', content: '' })
    setStreaming(true)
    await streamText(text, appendToLast)
    setStreaming(false)
  }, [addMessage, appendToLast, setStreaming])

  const formatGraduationReply = useCallback(async (major: string, status: unknown) => {
    const payload = status as Record<string, unknown>
    const categories = normalizeCategories(status)

    const totalCompleted = Number(payload.totalCompletedEcts ?? payload.completedEcts ?? 0)
    const totalRequired  = Number(payload.totalRequiredEcts ?? payload.totalEcts ?? 136)
    const remainingSu    = Math.max(0, totalRequired - totalCompleted)
    const estimated      = Number(payload.estimatedSemestersLeft ?? payload.estimatedSemesters ?? 0)

    const missingCodesFromCategories = categories.flatMap((c) => c.missingCourses)
    const missingCodesRaw = Array.isArray(payload.missingCourses) ? (payload.missingCourses as string[]) : []
    const missingCodes = Array.from(new Set([...missingCodesRaw, ...missingCodesFromCategories])).slice(0, 12)
    const map = await hydrateCourses(missingCodes)

    const categoryName: Record<string, string> = {
      core:         'Zorunlu / Cekirdek',
      area:         'Alan Secmeli',
      basicScience: 'Temel Bilim',
      free:         'Serbest Secmeli',
      university:   'Universite Dersleri',
    }

    const categoryLines = categories.length
      ? categories.map((c) => {
          const remain = Math.max(0, c.required - c.completed)
          return `- **${categoryName[c.key] ?? c.key}**: ${c.completed}/${c.required} SU Kredi (kalan: ${remain})`
        }).join('\n')
      : '- Kategori detayi donmedi.'

    const missingLines = missingCodes.length
      ? missingCodes.map((code) => shortCourse(code, map)).join('\n')
      : 'Eksik ders listesi bulunamadi.'

return `## Mezuniyet Durumu — ${major}

Toplam: **${totalCompleted}/${totalRequired} SU Kredi**
Kalan: **${remainingSu} SU Kredi**

### Kategori Bazli Kalanlar
${categoryLines}

### Eksik Ders Ornekleri
${missingLines}

Tahmini kalan donem: **${estimated || '?'}**`
  }, [hydrateCourses])

  const formatFallbackGraduationReply = useCallback(async (major: string) => {
    const core = MAJOR_CORE_HINTS[major] ?? []
    const missing = core.filter((c) => !selectedCourses.includes(c)).slice(0, 10)
    const map = await hydrateCourses(missing)

    return `## Mezuniyet Durumu — ${major}

Sectigin **${selectedCourses.length} ders** uzerinden yerel kontrol yapildi.

### Eksik Cekirdek Ornekleri
${missing.length ? missing.map((c) => shortCourse(c, map)).join('\n') : 'Belirgin cekirdek eksigi gorunmuyor.'}`
  }, [hydrateCourses, selectedCourses])

  const runGraduationAnalysis = useCallback(async (major: string) => {
    if (token && studentId) {
      try {
        const status = await api.getGraduationStatus(token, studentId, {
          major,
          semester: '1',
          completed: selectedCourses.join(','),
        })
        const text = await formatGraduationReply(major, status)
        await streamWizardReply(text)
        return
      } catch { /* fallback below */ }
    }
    const text = await formatFallbackGraduationReply(major)
    await streamWizardReply(text)
  }, [formatFallbackGraduationReply, formatGraduationReply, selectedCourses, streamWizardReply, studentId, token])

  const formatPlanReply = useCallback(async (major: string, trackIds: string[], difficulty: Exclude<Difficulty, null>) => {
    const tracks = rankTracksByProfile(major, wizard.profileTags).filter((t) => trackIds.includes(t.id))
    const trackCourses = tracks.flatMap((t) => t.courses)
    const corePool = MAJOR_CORE_HINTS[major] ?? []
    const coreNeed = corePool.filter((c) => !selectedCourses.includes(c)).slice(0, difficulty === 'hard' ? 3 : difficulty === 'balanced' ? 2 : 1)
    const trackNeed = trackCourses.filter((c) => !selectedCourses.includes(c)).slice(0, difficulty === 'hard' ? 4 : difficulty === 'balanced' ? 3 : 2)
    const helper = SUPPORTER_COURSES[difficulty]
    const finalList = Array.from(new Set([...coreNeed, ...trackNeed, ...helper]))
    const map = await hydrateCourses(finalList)
    const trackLabel = tracks.map((t) => t.label).join(' + ')

    return `## Bu Donem Ne Almaliyim? — ${major}

Secilen alan: **${trackLabel || 'Karisik'}** · Zorluk: **${difficulty}**

${finalList.map((c) => shortCourse(c, map)).join('\n')}

Yol notu: ${tracks.length ? tracks.map((t) => t.description).join(' | ') : 'Dengeli ilerleme secildi.'}

Farkli bir kombinasyon icin "daha kolay" veya "daha zor" yaz.`
  }, [hydrateCourses, selectedCourses, wizard.profileTags])

  const formatPathReply = useCallback(async (major: string, trackIds: string[]) => {
    const tracks = rankTracksByProfile(major, wizard.profileTags).filter((t) => trackIds.includes(t.id))
    const allCodes = Array.from(new Set(tracks.flatMap((t) => t.courses)))
    const map = await hydrateCourses(allCodes)

    const sections = tracks.map((track) => {
      const done    = track.courses.filter((c) => selectedCourses.includes(c)).length
      const total   = track.courses.length
      const pct     = total ? Math.round((done / total) * 100) : 0
      const missing = track.courses.filter((c) => !selectedCourses.includes(c)).slice(0, 6)
      const career  = TRACK_CAREER[track.id]

      const courseSection = missing.length
        ? `**Once al:**\n${missing.map((c) => shortCourse(c, map)).join('\n')}`
        : 'Bu alan icin onerilen derslerin cogu tamam.'

      const jobSection = career?.jobs?.length
        ? `\n\n**Calisabilecegin roller:**\n${career.jobs.map((j, i) => `${i + 1}. ${j}`).join('\n')}`
        : ''

      const gradSection = career?.grad?.length
        ? `\n\n**Yuksek lisans / doktora yonleri:**\n${career.grad.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
        : ''

      return `### ${track.label}\nTamamlanma: **%${pct}** (${done}/${total} ders)\n${track.description}\n\n${courseSection}${jobSection}${gradSection}`
    })

    return `## Hangi Alanda Ilerlemeliyim?

Profil secimin: **${wizard.profileTags.length ? wizard.profileTags.join(', ') : 'Belirtilmedi'}**

${sections.join('\n\n')}`
  }, [hydrateCourses, selectedCourses, wizard.profileTags])

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

  // Graduation wizard: no longer asks major — uses authMajor directly
  const startGraduationWizard = useCallback(() => {
    if (isStreaming) return
    const major = authMajor || 'CS'
    if (isComplete && selectedCourses.length > 0) {
      addMessage({ role: 'assistant', content: 'Mezuniyet analizi hesaplaniyor...', isWizard: true })
      setWizard({ ...INITIAL_WIZARD, type: 'graduation', step: 'sending', major })
      runGraduationAnalysis(major).then(() => setWizard(INITIAL_WIZARD))
    } else {
      addMessage({ role: 'assistant', content: 'Aldigin dersleri sec, mezuniyet durumunu hesaplayalim.', isWizard: true })
      setWizard({ ...INITIAL_WIZARD, type: 'graduation', step: 'course-select', major })
      setCoursePanelCategory('all')
      setShowPanel(true)
    }
  }, [isStreaming, authMajor, isComplete, selectedCourses.length, addMessage, runGraduationAnalysis])

  const startPlanWizard = useCallback(() => {
    if (isStreaming) return
    addMessage({ role: 'assistant', content: 'Bu donem plani icin bolumunu secelim.', isWizard: true })
    setWizard({ ...INITIAL_WIZARD, type: 'plan', step: 'major-select' })
  }, [isStreaming, addMessage])

  const startPathWizard = useCallback(() => {
    if (isStreaming) return
    addMessage({ role: 'assistant', content: 'Sana uygun alani bulmak icin once bolumunu sec.', isWizard: true })
    setWizard({ ...INITIAL_WIZARD, type: 'path', step: 'major-select' })
  }, [isStreaming, addMessage])

  const handleWizardSelect = useCallback(async (payload: {
    major?: string
    coursesDone?: boolean
    profileTag?: string
    profileDone?: boolean
    trackToggle?: string
    tracksDone?: boolean
    difficulty?: Exclude<Difficulty, null>
  }) => {
    if (isStreaming) return
    const { type, step, major } = wizard

    if (step === 'major-select' && payload.major) {
      const selectedMajor = payload.major
      addMessage({ role: 'user', content: `${selectedMajor} — ${MAJOR_LABELS[selectedMajor] ?? selectedMajor}` })

      if (type === 'plan') {
        if (isComplete && selectedCourses.length > 0) {
          addMessage({ role: 'assistant', content: 'En fazla 2 alan secebilirsin.', isWizard: true })
          setWizard((w) => ({ ...w, major: selectedMajor, step: 'track-select' }))
        } else {
          addMessage({ role: 'assistant', content: 'Once aldigin dersleri secelim, sonra alan seceriz.', isWizard: true })
          setWizard((w) => ({ ...w, major: selectedMajor, step: 'course-select' }))
          setCoursePanelCategory('all')
          setShowPanel(true)
        }
        return
      }

      if (type === 'path') {
        addMessage({ role: 'assistant', content: 'Seni tanimak icin en az 1, en fazla 3 ozellik sec.', isWizard: true })
        setWizard((w) => ({ ...w, major: selectedMajor, step: 'profile-select', profileTags: [], selectedTracks: [] }))
      }
      return
    }

    if (step === 'course-select' && payload.coursesDone) {
      markComplete()
      setShowPanel(false)
      addMessage({ role: 'user', content: `${selectedCourses.length} ders secildi` })

      if (type === 'graduation') {
        await runGraduationAnalysis(major || authMajor)
        setWizard(INITIAL_WIZARD)
        return
      }

      addMessage({
        role: 'assistant',
        content: type === 'path' ? 'Simdi seni tanimak icin birkac secim yap.' : 'Simdi alan secelim. En fazla 2 alan secebilirsin.',
        isWizard: true,
      })
      setWizard((w) => ({ ...w, step: type === 'path' ? 'profile-select' : 'track-select' }))
      return
    }

    if (step === 'profile-select' && payload.profileTag) {
      setWizard((w) => {
        const exists = w.profileTags.includes(payload.profileTag as string)
        if (exists) return { ...w, profileTags: w.profileTags.filter((t) => t !== payload.profileTag) }
        if (w.profileTags.length >= 3) return w
        return { ...w, profileTags: [...w.profileTags, payload.profileTag as string] }
      })
      return
    }

    if (step === 'profile-select' && payload.profileDone) {
      addMessage({ role: 'user', content: wizard.profileTags.length ? wizard.profileTags.join(', ') : 'Kararsizim' })
      addMessage({ role: 'assistant', content: 'Secimlerine gore alanlar. En fazla 2 alan secebilirsin.', isWizard: true })
      setWizard((w) => ({ ...w, step: 'track-select', selectedTracks: [] }))
      return
    }

    if (step === 'track-select' && payload.trackToggle) {
      const trackId = payload.trackToggle
      setWizard((w) => {
        const exists = w.selectedTracks.includes(trackId)
        if (exists) return { ...w, selectedTracks: w.selectedTracks.filter((t) => t !== trackId) }
        if (trackId === 'undecided') return { ...w, selectedTracks: ['undecided'] }
        const withoutUndecided = w.selectedTracks.filter((t) => t !== 'undecided')
        if (withoutUndecided.length >= 2) return w
        return { ...w, selectedTracks: [...withoutUndecided, trackId] }
      })
      return
    }

    if (step === 'track-select' && payload.tracksDone) {
      if (wizard.selectedTracks.length === 0) return
      const ranked = rankTracksByProfile(major || authMajor, wizard.profileTags)
      const selectedLabels = ranked.filter((t) => wizard.selectedTracks.includes(t.id)).map((t) => t.label)
      addMessage({ role: 'user', content: selectedLabels.join(' + ') })

      if (type === 'path') {
        const text = await formatPathReply(major || authMajor, wizard.selectedTracks)
        await streamWizardReply(text)
        setWizard(INITIAL_WIZARD)
        return
      }

      addMessage({ role: 'assistant', content: 'Zorluk seviyesini sec.', isWizard: true })
      setWizard((w) => ({ ...w, step: 'difficulty-select' }))
      return
    }

    if (step === 'difficulty-select' && payload.difficulty) {
      addMessage({ role: 'user', content: payload.difficulty })
      setWizard((w) => ({ ...w, difficulty: payload.difficulty as Exclude<Difficulty, null>, step: 'sending' }))
      const text = await formatPlanReply(major || authMajor, wizard.selectedTracks, payload.difficulty)
      await streamWizardReply(text)
      setWizard(INITIAL_WIZARD)
    }
  }, [
    addMessage, authMajor, formatPathReply, formatPlanReply, isComplete,
    isStreaming, markComplete, runGraduationAnalysis, selectedCourses.length,
    streamWizardReply, wizard,
  ])

  const dispatchInput = useCallback((text: string) => {
    const cleaned = text.trim()
    if (!cleaned) return

    const lowered = cleaned.toLowerCase()
    if (wizard.type === 'plan' && wizard.step === null && (lowered === 'daha kolay' || lowered === 'daha zor')) {
      const difficulty: Exclude<Difficulty, null> = lowered === 'daha kolay' ? 'easy' : 'hard'
      handleWizardSelect({ difficulty })
      return
    }

    const intent = detectIntent(cleaned)
    if (intent === 'graduation') {
      addMessage({ role: 'user', content: cleaned })
      return startGraduationWizard()
    }
    if (intent === 'plan') {
      addMessage({ role: 'user', content: cleaned })
      return startPlanWizard()
    }
    if (intent === 'path') {
      addMessage({ role: 'user', content: cleaned })
      return startPathWizard()
    }

    setWizard(INITIAL_WIZARD)
    sendRag(cleaned)
  }, [addMessage, handleWizardSelect, sendRag, startGraduationWizard, startPathWizard, startPlanWizard, wizard.step, wizard.type])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim()) { dispatchInput(input); setInput('') }
    }
  }

  const handleSend = () => {
    if (input.trim()) { dispatchInput(input); setInput('') }
  }

  const trackOptions = useMemo(
    () => rankTracksByProfile(wizard.major || authMajor, wizard.profileTags),
    [authMajor, wizard.major, wizard.profileTags],
  )

  return (
    <div className="flex h-full gap-3">
      {/* Main chat area */}
      <div className="flex flex-col flex-1 glass rounded-[28px] overflow-hidden min-w-0">
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-center text-white/50 text-sm">
              Asagidaki seceneklerden birini kullan veya direkt soru sor.
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          <AnimatePresence mode="wait">
            {wizard.step === 'major-select' && (
              <WizardCard key="major">
                <p className="text-xs text-white/50 mb-3">Ne okuyorsun?</p>
                <div className="flex flex-wrap gap-2">
                  {MAJORS.map((m) => (
                    <button key={m} onClick={() => handleWizardSelect({ major: m })}
                      className="glass glass-hover rounded-xl px-3 py-1.5 text-xs text-white/80 hover:text-white">
                      <span className="font-bold text-su-300">{m}</span>
                      <span className="text-white/40 ml-1">{MAJOR_LABELS[m]}</span>
                    </button>
                  ))}
                </div>
              </WizardCard>
            )}

            {wizard.step === 'course-select' && !showPanel && (
              <WizardCard key="coursePrompt">
                <p className="text-xs text-white/50 mb-2">Ders panelini acip aldigin dersleri sec.</p>
                <button onClick={() => {
                  setCoursePanelCategory('all')
                  setShowPanel(true)
                }}
                  className="text-xs px-3 py-1.5 rounded-xl bg-su-500/20 border border-su-300/30 text-su-300 hover:bg-su-500/30">
                  Paneli ac
                </button>
              </WizardCard>
            )}

            {wizard.step === 'course-select' && showPanel && (
              <WizardCard key="courseDone">
                <p className="text-xs text-white/50 mb-2">{selectedCourses.length} ders secildi. Devam et.</p>
                <button onClick={() => handleWizardSelect({ coursesDone: true })}
                  disabled={selectedCourses.length === 0}
                  className="text-xs px-3 py-1.5 rounded-xl bg-su-500 text-white hover:bg-su-300 disabled:opacity-30">
                  Devam et
                </button>
              </WizardCard>
            )}

            {wizard.step === 'profile-select' && (
              <WizardCard key="profile">
                <p className="text-xs text-white/50 mb-3">Sana uygun alanlari bulmak icin secim yap (1-3):</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {PROFILE_OPTIONS.map((p) => {
                    const picked = wizard.profileTags.includes(p.id)
                    return (
                      <button key={p.id} onClick={() => handleWizardSelect({ profileTag: p.id })}
                        className={cn('rounded-xl px-3 py-2 text-xs text-left border transition-all',
                          picked ? 'bg-su-500/25 border-su-300/50 text-white' : 'glass border-white/10 text-white/80 hover:text-white')}>
                        {p.label}
                      </button>
                    )
                  })}
                </div>
                <button onClick={() => handleWizardSelect({ profileDone: true })}
                  className="text-xs px-3 py-1.5 rounded-xl bg-su-500 text-white hover:bg-su-300">
                  Alanlari goster
                </button>
              </WizardCard>
            )}

            {wizard.step === 'track-select' && (
              <WizardCard key="track">
                <p className="text-xs text-white/50 mb-2">En az 1, en fazla 2 alan sec.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                  {trackOptions.slice(0, 8).map((track) => {
                    const picked = wizard.selectedTracks.includes(track.id)
                    return (
                      <button key={track.id} onClick={() => handleWizardSelect({ trackToggle: track.id })}
                        className={cn('rounded-xl px-3 py-2 text-left border transition-all',
                          picked ? 'bg-su-500/25 border-su-300/50 text-white' : 'glass border-white/10 text-white/80 hover:text-white')}>
                        <p className="text-xs font-semibold">{track.label}</p>
                        <p className="text-[11px] text-white/55 mt-0.5">{track.description}</p>
                      </button>
                    )
                  })}
                </div>
                <button onClick={() => handleWizardSelect({ tracksDone: true })}
                  disabled={wizard.selectedTracks.length === 0}
                  className="text-xs px-3 py-1.5 rounded-xl bg-su-500 text-white hover:bg-su-300 disabled:opacity-30">
                  Devam et
                </button>
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

        {/* Input area */}
        <div className="border-t border-white/8 p-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <QuickChip label="Mezuniyet Durumu" onClick={() => {
              addMessage({ role: 'user', content: 'Mezuniyet Durumu' })
              startGraduationWizard()
            }} disabled={isStreaming} />
            <QuickChip label="Bu donem ne almaliyim?" onClick={() => {
              addMessage({ role: 'user', content: 'Bu donem ne almaliyim?' })
              startPlanWizard()
            }} disabled={isStreaming} />
            <QuickChip label="Hangi alanda ilerlemeliyim?" onClick={() => {
              addMessage({ role: 'user', content: 'Hangi alanda ilerlemeliyim?' })
              startPathWizard()
            }} disabled={isStreaming} />
            <button
              onClick={() => {
                setCoursePanelCategory('all')
                setShowPanel(true)
              }}
              className="text-xs text-white/40 hover:text-white/80 px-2"
            >
              Derslerimi Guncelle
            </button>
            <button
              onClick={() => {
                setCoursePanelCategory('core')
                setShowPanel(true)
              }}
              className="text-xs text-white/40 hover:text-white/80 px-2"
            >
              Core Derslerimi Degistir
            </button>
            <button
              onClick={() => {
                setCoursePanelCategory('free')
                setShowPanel(true)
              }}
              className="text-xs text-white/40 hover:text-white/80 px-2"
            >
              Serbest Derslerimi Degistir
            </button>
            <button onClick={clearMessages} className="text-xs text-white/30 hover:text-white/60 px-2">
              Temizle
            </button>
          </div>

          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={isStreaming}
              rows={1}
              placeholder="Bir sey sor... (Enter gonderir)"
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

      {/* Course selector panel */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 380 }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="hidden md:flex shrink-0 glass rounded-[28px] overflow-hidden flex-col"
            style={{ minWidth: 0 }}
          >
            <CourseSelector
              initialMajor={wizard.major || authMajor}
              initialCategory={coursePanelCategory}
              onSave={() => handleWizardSelect({ coursesDone: true })}
              onClose={() => setShowPanel(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="absolute inset-x-2 bottom-2 top-14 glass rounded-[24px] overflow-hidden"
            >
              <CourseSelector
                initialMajor={wizard.major || authMajor}
                initialCategory={coursePanelCategory}
                onSave={() => handleWizardSelect({ coursesDone: true })}
                onClose={() => setShowPanel(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function QuickChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="glass glass-hover rounded-xl px-3 py-1.5 text-xs text-white/80 hover:text-white disabled:opacity-40">
      {label}
    </button>
  )
}

function WizardCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="self-start max-w-3xl">
      <div className="glass rounded-2xl px-4 py-3 border border-su-300/20">
        {children}
      </div>
    </motion.div>
  )
}
