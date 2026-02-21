'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore, useChatStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// ── SVG Icons (inline, no dep) ─────────────────────────────────────────────
function IconChat({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconCalendar({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function IconScroll({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function IconDocument({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function IconSettings({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function IconPerson({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconMenu({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function IconChevronLeft({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

const NAV = [
  { href: '/',           label: 'Chat',       Icon: IconChat },
  { href: '/plan',       label: 'Ders Plani',  Icon: IconCalendar },
  { href: '/graduation', label: 'Mezuniyet',  Icon: IconScroll },
  { href: '/exams',      label: 'Sinavlar',   Icon: IconDocument },
  { href: '/admin',      label: 'Admin',      Icon: IconSettings, adminOnly: true },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onClose?: () => void
}

export function Sidebar({ collapsed, onToggle, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { studentId, major, isAdmin, logout } = useAuthStore()
  const { sessions, activeSessionId, newSession, switchSession, deleteSession } = useChatStore()
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <aside
      className={cn(
        'sidebar-glass flex flex-col h-full transition-all duration-300 shrink-0',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      {/* Logo + toggle */}
      <div className={cn('flex items-center px-3 py-4 border-b border-white/8', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-white tracking-tight truncate">SU Advisor</p>
            <p className="text-[10px] text-white/35 truncate">Sabanci Universitesi</p>
          </div>
        )}
        <button
          onClick={() => { onToggle(); onClose?.() }}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all shrink-0"
        >
          {collapsed ? <IconMenu size={16} /> : <IconChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2 py-3">
        {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href} onClick={onClose}>
              <motion.div
                whileTap={{ scale: 0.96 }}
                className={cn(
                  'flex items-center gap-3 rounded-xl transition-all duration-200',
                  collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5',
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-white/55 hover:bg-white/8 hover:text-white',
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.Icon size={18} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-sm overflow-hidden whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {active && !collapsed && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-su-300 shrink-0"
                  />
                )}
              </motion.div>
            </Link>
          )
        })}
      </nav>

      {/* Chat history */}
      <div className="flex-1 min-h-0 border-t border-white/8 px-2 py-2 overflow-y-auto">
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] text-white/35 uppercase tracking-widest">Chat Gecmisi</p>
            <button
              onClick={() => {
                newSession()
                onClose?.()
              }}
              className="text-[10px] px-2 py-1 rounded-lg bg-su-500/25 text-su-300 hover:bg-su-500/35"
            >
              + Yeni
            </button>
          </div>
        )}

        {!collapsed && (
          <div className="flex flex-col gap-1">
            {sortedSessions.slice(0, 20).map((session) => {
              const isActive = session.id === activeSessionId && pathname === '/'
              return (
                <div
                  key={session.id}
                  className={cn(
                    'rounded-xl border px-2 py-1.5',
                    isActive ? 'border-su-300/40 bg-su-500/20' : 'border-white/8 bg-white/5',
                  )}
                >
                  <Link
                    href="/"
                    onClick={() => {
                      switchSession(session.id)
                      onClose?.()
                    }}
                    className="block w-full text-left"
                  >
                    <p className="text-[11px] text-white truncate">{session.title}</p>
                    <p className="text-[10px] text-white/35">{new Date(session.updatedAt).toLocaleString('tr-TR')}</p>
                  </Link>
                  <button
                    onClick={() => deleteSession(session.id)}
                    className="mt-1 text-[10px] text-white/30 hover:text-red-300"
                  >
                    sil
                  </button>
                </div>
              )
            })}
            {sortedSessions.length === 0 && (
              <p className="text-[11px] text-white/30 px-1 py-2">Henuz sohbet yok.</p>
            )}
          </div>
        )}
      </div>

      {/* User info */}
      <div className="border-t border-white/8 px-2 py-3 shrink-0">
        {studentId ? (
          <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
            <div className="w-7 h-7 rounded-full bg-su-500/30 border border-su-300/30 flex items-center justify-center shrink-0 text-su-300">
              <IconPerson size={14} />
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex-1 min-w-0 overflow-hidden"
                >
                  <p className="text-xs text-white/70 truncate">{studentId}</p>
                  <p className="text-[10px] text-su-300 truncate">{major}{isAdmin ? ' · Admin' : ''}</p>
                </motion.div>
              )}
            </AnimatePresence>
            {!collapsed && (
              <button
                onClick={logout}
                className="text-[10px] text-white/25 hover:text-white/60 transition-colors shrink-0"
                title="Cikis yap"
              >
                Cikis
              </button>
            )}
          </div>
        ) : (
          <div className={cn('flex', collapsed && 'justify-center')}>
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/30">
              <IconPerson size={14} />
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
