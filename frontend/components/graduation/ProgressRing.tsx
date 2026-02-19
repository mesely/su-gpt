'use client'
import { motion } from 'framer-motion'

interface ProgressRingProps {
  label: string
  completed: number
  required: number
  color?: string
  size?: number
}

export function ProgressRing({
  label, completed, required, color = '#4d9de0', size = 100,
}: ProgressRingProps) {
  const pct = required > 0 ? Math.min(completed / required, 1) : 0
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {/* Track */}
          <circle cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          {/* Progress */}
          <motion.circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold text-white">{completed}</span>
          <span className="text-xs text-white/40">/{required}</span>
        </div>
      </div>
      <span className="text-xs text-white/60 text-center max-w-[80px] leading-tight">{label}</span>
    </div>
  )
}
