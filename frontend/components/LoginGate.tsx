'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/lib/store'
import { GlassCard } from '@/components/ui/GlassCard'
import { Spinner } from '@/components/ui/Spinner'

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { token, login } = useAuthStore()
  const [studentId, setStudentId]   = useState('')
  const [major, setMajor]           = useState('CS')
  const [isAdmin, setIsAdmin]       = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  if (token) return <>{children}</>

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentId.trim()) return
    setLoading(true)
    setError('')
    try {
      await login(studentId.trim(), major, isAdmin)
    } catch {
      setError('Giriş başarısız. Gateway çalışıyor mu?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <GlassCard className="flex flex-col gap-5">
          <div className="text-center">
            <p className="text-2xl font-bold text-white mb-1">SU Advisor</p>
            <p className="text-sm text-white/50">Sabancı Üniversitesi · Mock SSO Girişi</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Öğrenci ID (ör: student001)"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-su-300 transition-colors"
            />

            <select
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-su-300 transition-colors"
            >
              {['CS', 'EE', 'ME', 'IE', 'MAT', 'BIO', 'PSY'].map((m) => (
                <option key={m} value={m} className="bg-su-900">{m}</option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="accent-su-500"
              />
              Admin girişi
            </label>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-su-500 hover:bg-su-300 disabled:opacity-50 text-white font-medium rounded-xl py-2.5 text-sm transition-colors"
            >
              {loading ? <Spinner className="w-4 h-4" /> : 'Giriş Yap'}
            </button>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  )
}
