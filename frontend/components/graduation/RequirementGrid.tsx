import { GlassCard } from '@/components/ui/GlassCard'
import { GlassBadge } from '@/components/ui/GlassBadge'
import { GraduationStatus } from '@/lib/api'

interface RequirementGridProps {
  status: GraduationStatus
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  core:         { label: 'Core',       color: '#4d9de0' },
  area:         { label: 'Alan',       color: '#f59e0b' },
  basicScience: { label: 'Temel Bil.', color: '#10b981' },
  university:   { label: 'Ünivers.',   color: '#a78bfa' },
  free:         { label: 'Serbest',    color: '#64748b' },
}

export function RequirementGrid({ status }: RequirementGridProps) {
  const categories = status.categories ?? {}
  const entries = Object.entries(categories)

  if (entries.length === 0) {
    return (
      <GlassCard>
        <p className="text-sm text-white/60">Kategori verisi henüz bulunamadı.</p>
      </GlassCard>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map(([key, cat]) => {
        const meta   = CATEGORY_META[key] ?? { label: key, color: '#4d9de0' }
        const pct    = cat.required > 0 ? Math.min((cat.completed / cat.required) * 100, 100) : 0
        const done   = pct >= 100

        return (
          <div key={key} className="glass rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{meta.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50">{cat.completed}/{cat.required} ECTS</span>
                {done
                  ? <GlassBadge label="Tamamlandı" variant="success" />
                  : <GlassBadge label={`${cat.required - cat.completed} eksik`} variant="warning" />
                }
              </div>
            </div>
            {/* Bar */}
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: done ? '#10b981' : meta.color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
