import { GlassCard } from '@/components/ui/GlassCard'
import { GlassBadge } from '@/components/ui/GlassBadge'

interface CategoryData {
  completed: number
  required: number
  courses?: string[]
}

interface RequirementGridProps {
  categories: Record<string, CategoryData>
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  core:         { label: 'Zorunlu / Cekirdek',  color: '#4d9de0' },
  area:         { label: 'Alan Secmeli',         color: '#f59e0b' },
  basicScience: { label: 'Temel Bilim',          color: '#10b981' },
  university:   { label: 'Universite',           color: '#a78bfa' },
  free:         { label: 'Serbest Secmeli',      color: '#64748b' },
}

export function RequirementGrid({ categories }: RequirementGridProps) {
  const entries = Object.entries(categories)

  if (entries.length === 0) {
    return (
      <GlassCard>
        <p className="text-sm text-white/60">
          Henuz ders secilmedi. Chat sekmesinden "Derslerimi Guncelle" butonunu kullan.
        </p>
      </GlassCard>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map(([key, cat]) => {
        const meta   = CATEGORY_META[key] ?? { label: key, color: '#4d9de0' }
        const pct    = cat.required > 0 ? Math.min((cat.completed / cat.required) * 100, 100) : 0
        const done   = pct >= 100
        const remain = Math.max(0, cat.required - cat.completed)

        return (
          <div key={key} className="glass rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{meta.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50">{cat.completed}/{cat.required} SU Kredi</span>
                {done
                  ? <GlassBadge label="Tamamlandi" variant="success" />
                  : <GlassBadge label={`${remain} eksik`} variant="warning" />
                }
              </div>
            </div>
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
