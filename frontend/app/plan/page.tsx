'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LoginGate } from '@/components/LoginGate'
import { SemesterTable } from '@/components/plan/SemesterTable'
import { GlassCard } from '@/components/ui/GlassCard'
import { useAuthStore, useCourseSelectionStore } from '@/lib/store'
import { api, Course } from '@/lib/api'

interface Semester { number: number; courses: Course[]; totalEcts: number }

function buildSemestersFromCourses(courses: Course[]): Semester[] {
  const sems: Semester[] = Array.from({ length: 1 }, (_, i) => ({
    number: i + 1, courses: [], totalEcts: 0,
  }))
  for (const c of courses) {
    sems[0].courses.push(c)
    sems[0].totalEcts += Number(c.suCredit ?? 0)
  }
  return sems
}

function PlanContent() {
  const { token, studentId, major } = useAuthStore()
  const { selectedCourses, inProgressCourses, acceptInProgressCourse, acceptAllInProgress } = useCourseSelectionStore()
  const [inProgressCourseRows, setInProgressCourseRows] = useState<Course[]>([])

  // Total from chat-recommended courses (this semester plan)
  const planTotal = inProgressCourseRows.reduce((a, c) => a + Number(c.suCredit ?? 0), 0)
  const semesters = buildSemestersFromCourses(inProgressCourseRows)

  useEffect(() => {
    if (!token || inProgressCourses.length === 0) {
      setInProgressCourseRows([])
      return
    }
    let cancelled = false
    void Promise.all(
      inProgressCourses.map(async (code) => {
        try { return await api.getCourse(token, code) } catch { return null }
      }),
    ).then((rows) => {
      if (cancelled) return
      setInProgressCourseRows(rows.filter(Boolean) as Course[])
    })
    return () => { cancelled = true }
  }, [token, inProgressCourses])

  return (
    <div className="flex flex-col gap-6">
      {/* Header bar */}
      <GlassCard className="flex items-center justify-between py-3 gap-4">
        <div>
          <p className="text-xs text-white/50">Bölüm</p>
          <p className="text-lg font-bold text-white">{major}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-white/50">Tamamlanan Ders</p>
          <p className="text-lg font-bold text-su-300">{selectedCourses.length}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/50">Bu Dönem Planı</p>
          <p className="text-lg font-bold text-su-300">{planTotal} SU Kredi</p>
        </div>
        {/* Plan progress bar */}
        <div className="flex-1 mx-4 h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-su-700 to-su-300 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min((planTotal / 18) * 100, 100)}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </div>
      </GlassCard>

      {inProgressCourseRows.length > 0 && <SemesterTable semesters={semesters} />}

      <GlassCard className="py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-white/50">Chat Önerileri</p>
            <p className="text-base font-semibold text-white">
              Bu Dönem Planı {planTotal > 0 ? `— ${planTotal} SU Kredi` : ''}
            </p>
          </div>
          <button
            onClick={() => acceptAllInProgress()}
            disabled={inProgressCourseRows.length === 0}
            className="text-xs px-3 py-1.5 rounded-xl bg-su-500 text-white hover:bg-su-300 disabled:opacity-40"
          >
            Tümünü Kabul Et
          </button>
        </div>
        {inProgressCourseRows.length === 0 ? (
          <p className="text-xs text-white/40">
            Chatten &quot;Bu dönem ne almalıyım?&quot; sorunca önerilen dersler burada görünür.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-2">
            {inProgressCourseRows.map((c) => (
              <div key={c.fullCode} className="glass rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-su-300">{c.fullCode}</p>
                  <p className="text-xs text-white/80 truncate">{c.name || c.fullCode}</p>
                  <p className="text-[10px] text-white/40">{Number(c.suCredit ?? 0)} SU Kredi</p>
                </div>
                <button
                  onClick={() => acceptInProgressCourse(c.fullCode)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20 shrink-0"
                >
                  Kabul Et
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  )
}

export default function PlanPage() {
  return (
    <LoginGate>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Dönem Planı</h1>
          <p className="text-sm text-white/50">Chat önerileri ve ders yükü.</p>
        </div>
        <PlanContent />
      </div>
    </LoginGate>
  )
}
