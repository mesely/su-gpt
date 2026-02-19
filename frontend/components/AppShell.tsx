'use client'
import { useAuthStore } from '@/lib/store'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { studentId, major, isAdmin, logout } = useAuthStore()

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <header className="glass border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <img
          src="/sabanci.png"
          alt="Sabanci"
          className="w-6 h-6 rounded-sm object-contain"
          onError={(e) => {
            if (e.currentTarget.src.endsWith('/sabanci.svg')) {
              e.currentTarget.style.display = 'none'
              return
            }
            e.currentTarget.src = '/sabanci.svg'
          }}
        />
        <div className="mr-3">
          <p className="text-sm font-semibold text-white">SU Advisor</p>
          <p className="text-[10px] text-white/40">Sabanci Universitesi</p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {studentId && <span className="text-xs text-white/50">{studentId} · {major}{isAdmin ? ' · Admin' : ''}</span>}
          <button onClick={logout} className="text-xs text-white/40 hover:text-white/80">Cikis</button>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden p-4">{children}</main>
    </div>
  )
}
