import { GlassCard } from '@/components/ui/GlassCard'
import { GlassBadge } from '@/components/ui/GlassBadge'
import { InstructorSummary } from '@/lib/api'

interface ReviewCardProps {
  summary: InstructorSummary
}

export function ReviewCard({ summary }: ReviewCardProps) {
  const score     = summary.sentimentScore
  const variant   = score >= 0.3 ? 'success' : score >= -0.1 ? 'warning' : 'danger'
  const scoreText = score >= 0.3 ? 'Olumlu' : score >= -0.1 ? 'Karışık' : 'Olumsuz'

  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{summary.instructorName}</p>
          {summary.courseCode && (
            <p className="text-xs text-su-300">{summary.courseCode}</p>
          )}
        </div>
        <GlassBadge label={scoreText} variant={variant} />
      </div>

      {/* Counts */}
      <div className="flex gap-3 text-xs">
        <span className="text-green-400">{summary.positiveCount} olumlu</span>
        <span className="text-white/30">·</span>
        <span className="text-red-400">{summary.negativeCount} olumsuz</span>
        <span className="text-white/30">·</span>
        <span className="text-white/40">{summary.neutralCount} nötr</span>
      </div>

      {/* Keywords */}
      {summary.topPositiveKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {summary.topPositiveKeywords.map((kw) => (
            <span key={kw} className="text-xs px-2 py-0.5 rounded-full badge-success">{kw}</span>
          ))}
        </div>
      )}

      {/* Recommendation */}
      <p className="text-sm text-white/70 italic leading-snug border-t border-white/10 pt-3">
        {summary.recommendation}
      </p>
    </GlassCard>
  )
}
