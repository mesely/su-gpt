'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/',           label: 'Chat',       icon: '💬' },
  { href: '/plan',       label: 'Ders Planı', icon: '📅' },
  { href: '/graduation', label: 'Mezuniyet',  icon: '🎓' },
  { href: '/exams',      label: 'Sınavlar',   icon: '📄' },
  { href: '/admin',      label: 'Admin',      icon: '⚙️',  adminOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const { studentId, major, isAdmin, logout } = useAuthStore()

  return (
    <aside className="w-56 shrink-0 glass border-r border-white/10 flex flex-col py-6 px-3 gap-2">
      {/* Logo */}
      <div className="px-3 mb-4">
        <p className="text-lg font-bold text-white tracking-tight">SU Advisor</p>
        <p className="text-xs text-white/40">Sabancı Üniversitesi</p>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1">
        {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all',
                  active
                    ? 'bg-su-500/25 text-white font-medium'
                    : 'text-white/60 hover:bg-white/8 hover:text-white',
                )}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-su-300"
                  />
                )}
              </motion.div>
            </Link>
          )
        })}
      </nav>

      {/* User info */}
      <div className="border-t border-white/10 pt-3 px-1">
        {studentId ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-white/60 px-2">{studentId}</p>
            <p className="text-xs text-su-300 px-2">{major} {isAdmin && '· Admin'}</p>
            <button
              onClick={logout}
              className="mt-1 text-xs text-white/30 hover:text-white/70 px-2 py-1 text-left transition-colors"
            >
              Çıkış yap
            </button>
          </div>
        ) : (
          <p className="text-xs text-white/30 px-2">Giriş yapılmadı</p>
        )}
      </div>
    </aside>
  )
}
