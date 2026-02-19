'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api, Course } from '@/lib/api'
import { useAuthStore, useCourseSelectionStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const PREFIXES = ['ALL', 'CS', 'IF', 'EE', 'ME', 'IE', 'MATH', 'HIST', 'TLL', 'AL', 'HUM', 'SPS', 'NS', 'ENS', 'ECON', 'PSYC']

interface CourseSelectorProps {
  /** Hangi sekme açık başlasın */
  initialMajor?: string
  onSave: (codes: string[]) => void
  onClose: () => void
}

export function CourseSelector({ initialMajor = 'CS', onSave, onClose }: CourseSelectorProps) {
  const { token } = useAuthStore()
  const { selectedCourses, toggleCourse } = useCourseSelectionStore()
  const initialPrefix = initialMajor === 'MAT' ? 'MATH' : initialMajor

  const [activePrefix, setActivePrefix] = useState(initialPrefix)
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  const fetchCourses = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setCourses([])
    try {
      const res = await api.searchCourses(token, { pageSize: '5000' })
      setCourses((res.courses ?? []).sort((a, b) => a.fullCode.localeCompare(b.fullCode)))
    } catch {
      setCourses([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchCourses() }, [fetchCourses])

  function codePrefix(fullCode: string) {
    const m = fullCode.match(/^[A-Z]+/)
    return m ? m[0] : fullCode
  }

  const filtered = courses.filter((c) => {
    if (activePrefix !== 'ALL' && codePrefix(c.fullCode) !== activePrefix) return false
    if (!searchQ) return true
    const q = searchQ.toLowerCase()
    return c.fullCode.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  })

  const handleTabChange = (m: string) => {
    setActivePrefix(m)
    setSearchQ('')
  }

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
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div>
          <p className="text-sm font-semibold text-white">Aldığım Dersler</p>
          <p className="text-xs text-white/40">{selectedCourses.length} ders seçildi</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSave(selectedCourses)}
            className="px-3 py-1.5 rounded-xl bg-su-500 hover:bg-su-300 text-xs text-white font-medium transition-colors"
          >
            Kaydet ✓
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg glass glass-hover flex items-center justify-center text-white/50 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Prefix sekmeleri */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto shrink-0 border-b border-white/10">
        {PREFIXES.map((m) => (
          <button
            key={m}
            onClick={() => handleTabChange(m)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all',
              activePrefix === m
                ? 'bg-su-500 text-white font-semibold'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5',
            )}
          >
            {m === 'ALL' ? 'Tümü' : m}
          </button>
        ))}
      </div>

      {/* Arama */}
      <div className="px-3 py-2 shrink-0">
        <input
          type="text"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Ders ara…"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-su-300"
        />
      </div>

      {/* Ders listesi */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-1.5">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-white/20 border-t-su-300 rounded-full animate-spin" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-white/30 text-center py-8">Ders bulunamadı</p>
        )}
        <AnimatePresence>
          {!loading && filtered.map((c, i) => {
            const selected = selectedCourses.includes(c.fullCode)
            const badge = c.categories?.isCore
              ? { label: 'Core', cls: 'text-blue-300 bg-blue-500/15' }
              : c.categories?.isArea
              ? { label: 'Area', cls: 'text-amber-300 bg-amber-500/15' }
              : c.categories?.isBasicScience
              ? { label: 'BS', cls: 'text-emerald-300 bg-emerald-500/15' }
              : { label: 'Serbest', cls: 'text-white/40 bg-white/8' }

            return (
              <motion.button
                key={c.fullCode}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.012 }}
                onClick={() => toggleCourse(c.fullCode)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all',
                  selected
                    ? 'bg-su-500/25 border border-su-300/40'
                    : 'glass hover:bg-white/8 border border-transparent',
                )}
              >
                {/* Checkbox */}
                <div className={cn(
                  'w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
                  selected ? 'bg-su-500 border-su-300' : 'border-white/20',
                )}>
                  {selected && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  )}
                </div>

                {/* Ders bilgisi */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-su-300">{c.fullCode}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium', badge.cls)}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-sm text-white/80 truncate">{c.name}</p>
                </div>

                {/* ECTS */}
                <span className="text-[10px] text-white/30 shrink-0">{c.ects} ECTS</span>
              </motion.button>
            )
          })}
        </AnimatePresence>

        {/* Tab seçim özeti */}
        {!loading && selectedInTab > 0 && (
          <p className="text-center text-[10px] text-white/30 py-2">
            Bu sekmede {selectedInTab} ders seçildi
          </p>
        )}
      </div>
    </motion.div>
  )
}
