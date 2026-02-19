import { cn } from '@/lib/utils'

type Variant = 'success' | 'warning' | 'danger' | 'neutral' | 'su'

interface GlassBadgeProps {
  label: string
  variant?: Variant
  className?: string
}

export function GlassBadge({ label, variant = 'su', className }: GlassBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        `badge-${variant}`,
        className,
      )}
    >
      {label}
    </span>
  )
}
