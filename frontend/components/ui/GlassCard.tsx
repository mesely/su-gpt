import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  hover?: boolean
}

export function GlassCard({ children, className, onClick, hover = true }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'glass rounded-glass p-5',
        hover && 'glass-hover cursor-default',
        onClick && 'cursor-pointer',
        'animate-fade-in',
        className,
      )}
    >
      {children}
    </div>
  )
}
