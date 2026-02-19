'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LoginGate } from '@/components/LoginGate'
import { SemesterTable } from '@/components/plan/SemesterTable'
import { GlassCard } from '@/components/ui/GlassCard'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/lib/store'
import { api, Course } from '@/lib/api'

interface Semester { number: number; courses: Course[]; totalEcts: number }

function buildDemoSemesters(courses: Course[]): Semester[] {
  // Basit dağılım: ilk 30 ECTS'i dönem 1'e, sonraki 30'u dönem 2'ye...
  const sems: Semester[] = Array.from({ length: 5 }, (_, i) => ({
    number: i + 1, courses: [], totalEcts: 0,
  }))
  let ects = 0, si = 0
  for (const c of courses.slice(0, 25)) {
    if (ects + c.ects > 30 && si < 4) { si++; ects = 0 }
    sems[si].courses.push(c)
    sems[si].totalEcts += c.ects
    ects += c.ects
  }
  return sems
}

function PlanContent() {
  const { token, studentId, major } = useAuthStore()
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [totalEcts, setTotalEcts] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token || !studentId) return
    setLoading(true)
    api.searchCourses(token, { major, pageSize: '25' })
      .then((res) => {
        const sems = buildDemoSemesters(res.courses ?? [])
        setSemesters(sems)
        setTotalEcts(sems.reduce((a, s) => a + s.totalEcts, 0))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, studentId, major])

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
  if (error)   return <p className="text-red-400 text-sm">{error}</p>

  return (
    <div className="flex flex-col gap-6">
      {/* Header bar */}
      <GlassCard className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm text-white/50">Major</p>
          <p className="text-lg font-bold text-white">{major}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-white/50">Planlanan ECTS</p>
          <p className="text-lg font-bold text-su-300">{totalEcts} / 240</p>
        </div>
        {/* Genel ECTS bar */}
        <div className="flex-1 mx-8 h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-su-700 to-su-300 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min((totalEcts / 240) * 100, 100)}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </div>
      </GlassCard>

      <SemesterTable semesters={semesters} />
    </div>
  )
}

export default function PlanPage() {
  return (
    <LoginGate>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Dönem Planı</h1>
          <p className="text-sm text-white/50">Ders yükünü dönem dönem görüntüle.</p>
        </div>
        <PlanContent />
      </div>
    </LoginGate>
  )
}
