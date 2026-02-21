'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api, Course } from '@/lib/api'
import { useAuthStore, useCourseSelectionStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// PSY (not PSYC)
const PREFIXES = [
  'ALL', 'CS', 'IF', 'EE', 'ME', 'IE', 'MATH', 'MAT', 'BIO', 'PSY',
  'ACC', 'ECON', 'HIST', 'TLL', 'AL', 'HUM', 'SPS', 'NS', 'ENS',
  'CHEM', 'PHYS', 'DSA', 'PROJ', 'CIP', 'ANTH', 'CONF', 'CULT',
]

const PREFIX_ALIASES: Record<string, string[]> = {
  MATH: ['MATH', 'MAT'],
  MAT: ['MAT', 'MATH'],
}

interface CourseSelectorProps {
  initialMajor?: string
  initialCategory?: 'all' | 'core' | 'area' | 'basicScience' | 'free' | 'university'
  onSave: (codes: string[]) => void
  onClose: () => void
}

function normalizeMajorPrefix(raw: string): string {
  const token = String(raw ?? '').toUpperCase().trim()
  const m = token.match(/[A-Z]{2,6}/)
  const parsed = (m?.[0] ?? 'CS').toUpperCase()
  if (parsed === 'MAT') return 'MATH'
  return parsed
}

function normalizeCourse(raw: Record<string, unknown>): Course {
  const categoriesRaw = (raw.categories ?? {}) as Record<string, unknown>
  return {
    _id: String(raw._id ?? raw.id ?? raw.fullCode ?? raw.full_code ?? ''),
    fullCode: String(raw.fullCode ?? raw.full_code ?? ''),
    code: String(raw.code ?? ''),
    major: String(raw.major ?? ''),
    name: String(raw.name ?? ''),
    ects: Number(raw.ects ?? 0),
    suCredit: Number(raw.suCredit ?? raw.su_credit ?? 0),
    faculty: String(raw.faculty ?? ''),
    elType: String(raw.elType ?? raw.el_type ?? ''),
    categories: {
      isCore: Boolean(categoriesRaw.isCore ?? categoriesRaw.is_core ?? false),
      isArea: Boolean(categoriesRaw.isArea ?? categoriesRaw.is_area ?? false),
      isBasicScience: Boolean(categoriesRaw.isBasicScience ?? categoriesRaw.is_basic_science ?? false),
    },
    prerequisites: Array.isArray(raw.prerequisites) ? (raw.prerequisites as string[]) : [],
    instructors: Array.isArray(raw.instructors) ? (raw.instructors as string[]) : [],
    description: String(raw.description ?? ''),
  }
}

export function CourseSelector({
  initialMajor = 'CS',
  initialCategory = 'all',
  onSave,
  onClose,
}: CourseSelectorProps) {
  const { token } = useAuthStore()
  const { selectedCourses, toggleCourse } = useCourseSelectionStore()
  const initialPrefix = normalizeMajorPrefix(initialMajor)

  const [activePrefix, setActivePrefix] = useState(PREFIXES.includes(initialPrefix) ? initialPrefix : 'ALL')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'core' | 'area' | 'basicScience' | 'free' | 'university'>(initialCategory)
  const [courses, setCourses]           = useState<Course[]>([])
  const [loading, setLoading]           = useState(false)
  const [searchQ, setSearchQ]           = useState('')

  const fetchAllPages = useCallback(async (params: Record<string, string>) => {
    if (!token) return [] as Course[]
    const pageSize = 1000
    let page = 1
    let total = 0
    const acc: Course[] = []

    do {
      const res = await api.searchCourses(token, { ...params, page: String(page), pageSize: String(pageSize) })
      const normalized = (res.courses ?? [])
        .map((c) => normalizeCourse(c as unknown as Record<string, unknown>))
        .filter((c) => c.fullCode)
      acc.push(...normalized)
      total = Number(res.total ?? 0)
      page += 1
      if (normalized.length === 0) break
    } while (acc.length < total)

    const uniq = new Map<string, Course>()
    for (const c of acc) uniq.set(c.fullCode, c)
    return Array.from(uniq.values())
  }, [token])

  const fetchCourses = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setCourses([])
    try {
      const aliases = PREFIX_ALIASES[activePrefix] ?? [activePrefix]
      const collected: Course[] = []

      if (activePrefix === 'ALL') {
        const params: Record<string, string> = {}
        if (searchQ.trim()) params.q = searchQ.trim()
        const all = await fetchAllPages(params)
        collected.push(...all)
      } else {
        for (const pref of aliases) {
          const params: Record<string, string> = { q: pref }
          const rows = await fetchAllPages(params)
          collected.push(...rows)
        }
      }
      const uniq = new Map<string, Course>()
      for (const c of collected) uniq.set(c.fullCode, c)
      setCourses(Array.from(uniq.values()).sort((a, b) => a.fullCode.localeCompare(b.fullCode)))
    } catch {
      setCourses([])
    } finally {
      setLoading(false)
    }
  }, [token, activePrefix, searchQ, fetchAllPages])

  useEffect(() => { fetchCourses() }, [fetchCourses])
  useEffect(() => { setCategoryFilter(initialCategory) }, [initialCategory])

  function codePrefix(fullCode: string) {
    const m = fullCode.match(/^[A-Z]+/)
    return m ? m[0] : fullCode
  }

  const filtered = courses.filter((c) => {
    if (activePrefix !== 'ALL') {
      const prefix = codePrefix(c.fullCode)
      const allowed = new Set(PREFIX_ALIASES[activePrefix] ?? [activePrefix])
      if (!allowed.has(prefix)) return false
    }
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'core' && !c.categories?.isCore) return false
      if (categoryFilter === 'area' && !c.categories?.isArea) return false
      if (categoryFilter === 'basicScience' && !c.categories?.isBasicScience) return false
      if (categoryFilter === 'free' && c.elType !== 'free') return false
      if (categoryFilter === 'university' && c.elType !== 'university') return false
    }
    if (!searchQ) return true
    const q = searchQ.toLowerCase()
    return c.fullCode.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  })

  const handleTabChange = (m: string) => { setActivePrefix(m); setSearchQ('') }
  const selectedInTab = filtered.filter((c) => selectedCourses.includes(c.fullCode)).length

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <div>
          <p className="text-sm font-semibold text-white">Aldiklarim</p>
          <p className="text-xs text-white/40">{selectedCourses.length} ders secildi</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onSave(selectedCourses)}
            className="px-3 py-1.5 rounded-xl bg-su-500 hover:bg-su-300 text-xs text-white font-medium transition-colors">
            Kaydet
          </button>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg glass glass-hover flex items-center justify-center text-white/50 hover:text-white text-sm">
            ✕
          </button>
        </div>
      </div>

      {/* Prefix tabs */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto shrink-0 border-b border-white/8">
        {PREFIXES.map((m) => (
          <button key={m} onClick={() => handleTabChange(m)}
            className={cn('px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all',
              activePrefix === m ? 'bg-su-500 text-white font-semibold' : 'text-white/50 hover:text-white/80 hover:bg-white/5')}>
            {m === 'ALL' ? 'Tumu' : m}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="mb-2 flex flex-wrap gap-1">
          {[
            { key: 'all', label: 'Tumleri' },
            { key: 'core', label: 'Core' },
            { key: 'area', label: 'Area' },
            { key: 'basicScience', label: 'Temel Bilim' },
            { key: 'free', label: 'Serbest' },
            { key: 'university', label: 'Universite' },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(cat.key as typeof categoryFilter)}
              className={cn(
                'rounded-lg px-2 py-1 text-[10px] transition-colors',
                categoryFilter === cat.key ? 'bg-su-500/35 text-white' : 'bg-white/5 text-white/55 hover:text-white',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <input type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Ders ara..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-su-300" />
      </div>

      {/* Course list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-1.5">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-white/20 border-t-su-300 rounded-full animate-spin" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-white/30 text-center py-8">
            Ders bulunamadi
          </p>
        )}
        <AnimatePresence>
          {!loading && filtered.map((c, i) => {
            const selected = selectedCourses.includes(c.fullCode)
            const badge = c.categories?.isCore
              ? { label: 'Core',    cls: 'text-blue-300 bg-blue-500/15' }
              : c.categories?.isArea
              ? { label: 'Area',    cls: 'text-amber-300 bg-amber-500/15' }
              : c.categories?.isBasicScience
              ? { label: 'BS',      cls: 'text-emerald-300 bg-emerald-500/15' }
              : { label: 'Secmeli', cls: 'text-white/40 bg-white/8' }

            // Display SU credit if available, otherwise ECTS
            const creditLabel = c.suCredit > 0 ? `${c.suCredit} Kr` : `${c.ects} Kr`
            // Display name if available, else fallback to fullCode
            const displayName = c.name && c.name.trim() ? c.name : c.fullCode

            return (
              <motion.button key={c.fullCode}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.012 }}
                onClick={() => toggleCourse(c.fullCode)}
                className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all',
                  selected ? 'bg-su-500/25 border border-su-300/40' : 'glass hover:bg-white/8 border border-transparent')}>

                {/* Checkbox */}
                <div className={cn('w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
                  selected ? 'bg-su-500 border-su-300' : 'border-white/20')}>
                  {selected && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  )}
                </div>

                {/* Course info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-su-300">{c.fullCode}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium', badge.cls)}>{badge.label}</span>
                  </div>
                  <p className="text-sm text-white/80 truncate">{displayName}</p>
                </div>

                {/* Credit */}
                <span className="text-[10px] text-white/30 shrink-0">{creditLabel}</span>
              </motion.button>
            )
          })}
        </AnimatePresence>

        {!loading && selectedInTab > 0 && (
          <p className="text-center text-[10px] text-white/30 py-2">
            Bu sekmede {selectedInTab} ders secildi
          </p>
        )}
      </div>
    </motion.div>
  )
}
