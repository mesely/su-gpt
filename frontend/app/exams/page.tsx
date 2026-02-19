'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LoginGate } from '@/components/LoginGate'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassBadge } from '@/components/ui/GlassBadge'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/lib/store'
import { api, Exam } from '@/lib/api'

const SEMESTER_LABELS: Record<string, string> = { fall: 'Güz', spring: 'Bahar', summer: 'Yaz' }
const TYPE_LABELS:     Record<string, string> = { midterm: 'Ara Sınav', final: 'Final', quiz: 'Quiz' }

function ExamRow({ exam, token }: { exam: Exam; token: string }) {
  const [loading, setLoading] = useState(false)

  const openPdf = async () => {
    setLoading(true)
    try {
      const res = await api.getExamUrl(token, exam.id)
      window.open(res.presigned_url, '_blank')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className="glass glass-hover rounded-2xl p-4 flex items-center gap-4"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="w-10 h-10 rounded-xl bg-su-500/20 flex items-center justify-center text-lg shrink-0">
        📄
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm">{exam.courseCode}</p>
        <p className="text-xs text-white/50">
          {exam.year} · {SEMESTER_LABELS[exam.semester] ?? exam.semester} · {TYPE_LABELS[exam.type] ?? exam.type}
        </p>
      </div>
      <GlassBadge label={TYPE_LABELS[exam.type] ?? exam.type} variant="su" />
      <button
        onClick={openPdf}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs text-su-300 hover:text-white transition-colors disabled:opacity-40"
      >
        {loading ? <Spinner className="w-3.5 h-3.5" /> : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        )}
        İndir
      </button>
    </motion.div>
  )
}

function ExamsContent() {
  const { token } = useAuthStore()
  const [exams, setExams]       = useState<Exam[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [courseCode, setCourse] = useState('')
  const [type, setType]         = useState('')

  const load = () => {
    if (!token) return
    setLoading(true)
    const params: Record<string, string> = {}
    if (courseCode) params.courseCode = courseCode
    if (type) params.type = type
    api.getExams(token, params)
      .then((r) => { setExams(r.exams ?? []); setTotal(r.total) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [token])

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <GlassCard className="flex gap-3 flex-wrap py-3">
        <input
          type="text"
          placeholder="Ders kodu (CS412)"
          value={courseCode}
          onChange={(e) => setCourse(e.target.value.toUpperCase())}
          className="bg-white/5 border border-white/15 rounded-xl px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-su-300 w-40"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-white/5 border border-white/15 rounded-xl px-3 py-1.5 text-sm text-white outline-none focus:border-su-300"
        >
          <option value="" className="bg-su-900">Tüm tipler</option>
          <option value="midterm" className="bg-su-900">Ara Sınav</option>
          <option value="final"   className="bg-su-900">Final</option>
          <option value="quiz"    className="bg-su-900">Quiz</option>
        </select>
        <button
          onClick={load}
          className="bg-su-500 hover:bg-su-300 text-white text-sm px-4 py-1.5 rounded-xl transition-colors"
        >
          Filtrele
        </button>
        <span className="ml-auto self-center text-xs text-white/40">{total} sınav</span>
      </GlassCard>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : exams.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-2 text-white/30">
          <span className="text-4xl">📭</span>
          <p className="text-sm">Sınav bulunamadı.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {exams.map((e) => (
            <ExamRow key={e.id} exam={e} token={token!} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ExamsPage() {
  return (
    <LoginGate>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Sınav Arşivi</h1>
          <p className="text-sm text-white/50">Geçmiş sınavları filtrele ve indir.</p>
        </div>
        <ExamsContent />
      </div>
    </LoginGate>
  )
}
