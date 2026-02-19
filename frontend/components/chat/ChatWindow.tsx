'use client'
import { useRef, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MessageBubble } from './MessageBubble'
import { useChatStore, useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const QUICK_ACTIONS = [
  { label: 'Mezuniyet durumum nedir?', contextType: 'graduation_check' },
  { label: 'Bu dönem ne almalıyım?', contextType: 'course_qa' },
  { label: 'NLP path önerileri', contextType: 'path_advisor' },
  { label: 'Ercan hoca hakkında', contextType: 'instructor_review' },
]

export function ChatWindow() {
  const { messages, isStreaming, addMessage, appendToLast, setStreaming, clearMessages } = useChatStore()
  const { token, studentId, major } = useAuthStore()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (question: string, contextType?: string) => {
    if (!question.trim() || isStreaming || !token) return

    addMessage({ role: 'user', content: question })
    addMessage({ role: 'assistant', content: '' })
    setStreaming(true)
    setInput('')

    try {
      const stream = api.askStream(token, {
        question,
        studentId: studentId ?? 'anonymous',
        major,
        contextType: contextType ?? 'course_qa',
      })
      const reader = stream.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        appendToLast(value)
      }
    } catch (err) {
      appendToLast(`\n\n[Hata: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}]`)
    } finally {
      setStreaming(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="flex h-full gap-4">
      {/* ── Sol: Quick actions ──────────────────────────────────── */}
      <div className="hidden md:flex flex-col gap-2 w-52 shrink-0">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-1 px-1">Hızlı Sorular</p>
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => send(a.label, a.contextType)}
            disabled={isStreaming}
            className="glass glass-hover rounded-2xl px-3 py-2.5 text-left text-sm text-white/80 hover:text-white disabled:opacity-40 transition-all"
          >
            {a.label}
          </button>
        ))}
        <div className="mt-auto">
          <button
            onClick={clearMessages}
            className="w-full text-xs text-white/30 hover:text-white/60 transition-colors py-2"
          >
            Sohbeti temizle
          </button>
        </div>
      </div>

      {/* ── Sağ: Chat alanı ──────────────────────────────────────── */}
      <div className="flex flex-col flex-1 glass rounded-glass overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-16">
              <div className="w-16 h-16 rounded-full glass flex items-center justify-center text-3xl">
                🎓
              </div>
              <p className="text-white/60 text-sm max-w-xs">
                SU Advisor&apos;a ders, mezuniyet veya hoca hakkında soru sorabilirsin.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-white/10 p-3 flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={isStreaming}
            rows={1}
            placeholder="Bir şey sor… (Enter göndermek için, Shift+Enter yeni satır)"
            className={cn(
              'flex-1 bg-transparent text-white placeholder-white/30 text-sm resize-none outline-none',
              'max-h-28 overflow-y-auto leading-relaxed',
            )}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = t.scrollHeight + 'px'
            }}
          />
          <motion.button
            onClick={() => send(input)}
            disabled={isStreaming || !input.trim()}
            whileTap={{ scale: 0.93 }}
            className="w-9 h-9 rounded-full bg-su-500 hover:bg-su-300 disabled:opacity-30 flex items-center justify-center shrink-0 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" />
            </svg>
          </motion.button>
        </div>
      </div>
    </div>
  )
}
