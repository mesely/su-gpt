'use client'
import { useEffect, useMemo, useState } from 'react'
import { LoginGate } from '@/components/LoginGate'
import { ProgressRing } from '@/components/graduation/ProgressRing'
import { RequirementGrid } from '@/components/graduation/RequirementGrid'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassBadge } from '@/components/ui/GlassBadge'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore, useCourseSelectionStore } from '@/lib/store'
import { api, GraduationStatus } from '@/lib/api'

const RING_COLORS: Record<string, string> = {
  core:         '#4d9de0',
  area:         '#f59e0b',
  basicScience: '#10b981',
  university:   '#a78bfa',
  free:         '#64748b',
}

const RING_LABELS: Record<string, string> = {
  core: 'Zorunlu', area: 'Alan Seçmeli', basicScience: 'Temel Bilim', university: 'Üniversite', free: 'Serbest',
}

function GraduationContent() {
  const { token, studentId, major } = useAuthStore()
  const { selectedCourses } = useCourseSelectionStore()
  const [status, setStatus] = useState<GraduationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!token || !studentId) { setLoading(false); return }
    setLoading(true)
    api.getGraduationStatus(token, studentId, {
      major,
      semester: '1',
      completed: selectedCourses.join(','),
    })
      .then(setStatus)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, studentId, major, selectedCourses])

  // Normalize to consistent format
  const normalizedCategories = useMemo(() => {
    if (!status) return {}
    if (status.categoryStatuses?.length) {
      return Object.fromEntries(
        status.categoryStatuses.map((c) => [c.category, {
          completed: c.completedEcts,
          required: c.requiredEcts,
          courses: c.missingCourses ?? [],
        }])
      )
    }
    return status.categories ?? {}
  }, [status])

  const normalizedPaths = useMemo(() => {
    if (!status) return {}
    if (status.pathProgresses?.length) {
      return Object.fromEntries(
        status.pathProgresses.map((p) => [p.pathId, {
          name: p.pathName,
          completionPct: p.completionPct,
        }])
      )
    }
    return status.paths ?? {}
  }, [status])

  const completed = (status?.totalCompletedEcts ?? status?.completedEcts ?? 0)
  const total     = (status?.totalRequiredEcts   ?? status?.totalEcts   ?? 136)
  const totalPct  = total > 0 ? Math.round((completed / total) * 100) : 0

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
  if (error)   return <p className="text-red-400 text-sm">{error}</p>
  if (!status) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Sol: Progress Rings */}
      <div className="lg:col-span-1 flex flex-col gap-4">
        {/* Genel */}
        <GlassCard className="flex flex-col items-center gap-3 py-6">
          <ProgressRing
            label="SU Kredi"
            completed={completed}
            required={total}
            color="#4d9de0"
            size={120}
          />
          <GlassBadge
            label={`%${totalPct} tamamlandı`}
            variant={totalPct >= 80 ? 'success' : totalPct >= 50 ? 'warning' : 'danger'}
          />
          {(status.estimatedSemestersLeft ?? 0) > 0 && (
            <p className="text-xs text-white/40 text-center">
              Tahminen {status.estimatedSemestersLeft} dönem kaldı
            </p>
          )}
        </GlassCard>

        {/* Kategori Rings */}
        {Object.keys(normalizedCategories).length > 0 && (
          <GlassCard>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-4">Kategoriler</p>
            <div className="flex flex-wrap gap-4 justify-center">
              {Object.entries(normalizedCategories).map(([key, cat]) => (
                <ProgressRing
                  key={key}
                  label={RING_LABELS[key] ?? key}
                  completed={cat.completed}
                  required={cat.required}
                  color={RING_COLORS[key] ?? '#4d9de0'}
                  size={80}
                />
              ))}
            </div>
          </GlassCard>
        )}

        {selectedCourses.length === 0 && (
          <GlassCard>
            <p className="text-xs text-white/50 text-center">
              Chat'ten "Derslerimi Güncelle" ile aldığın dersleri ekle — grafikler güncellensin.
            </p>
          </GlassCard>
        )}
      </div>

      {/* Sağ: Detaylar */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        {/* Requirement grid */}
        <div>
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Gereksinimler</p>
          <RequirementGrid categories={normalizedCategories} />
        </div>

        {/* Eksik dersler */}
        {status.missingCourses && status.missingCourses.length > 0 && (
          <GlassCard>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Eksik Dersler</p>
            <div className="flex flex-wrap gap-2">
              {status.missingCourses.map((c) => (
                <GlassBadge key={c} label={c} variant="danger" />
              ))}
            </div>
          </GlassCard>
        )}

        {/* Path seçici */}
        {Object.keys(normalizedPaths).length > 0 && (
          <GlassCard>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Kariyer Yolları</p>
            <div className="flex flex-col gap-3">
              {Object.entries(normalizedPaths).map(([id, path]) => (
                <div key={id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white">{path.name}</span>
                      <span className="text-su-300">%{Math.round(path.completionPct)}</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-su-500 rounded-full transition-all duration-700"
                        style={{ width: `${path.completionPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  )
}

export default function GraduationPage() {
  return (
    <LoginGate>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Mezuniyet Takibi</h1>
          <p className="text-sm text-white/50">SU kredi durumunu ve eksik dersleri görüntüle.</p>
        </div>
        <GraduationContent />
      </div>
    </LoginGate>
  )
}
