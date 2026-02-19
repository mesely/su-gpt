'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { studentId, major, isAdmin, logout } = useAuthStore()

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <header className="glass border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <img
          src="/sabanci.png"
          alt="Sabanci"
          className="w-6 h-6 rounded-sm object-contain"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
        <div className="mr-3">
          <p className="text-sm font-semibold text-white">SU Advisor</p>
          <p className="text-[10px] text-white/40">Sabanci Universitesi</p>
        </div>

        <nav className="flex items-center gap-2">
          <Link href="/" className={cn('px-3 py-1.5 rounded-lg text-xs', pathname === '/' ? 'bg-su-500/30 text-white' : 'text-white/60 hover:text-white')}>Chat</Link>
          {isAdmin && (
            <Link href="/admin" className={cn('px-3 py-1.5 rounded-lg text-xs', pathname === '/admin' ? 'bg-su-500/30 text-white' : 'text-white/60 hover:text-white')}>Admin</Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {studentId && <span className="text-xs text-white/50">{studentId} · {major}</span>}
          <button onClick={logout} className="text-xs text-white/40 hover:text-white/80">Cikis</button>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden p-4">{children}</main>
    </div>
  )
}
