'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from './api'

// ─── Auth ──────────────────────────────────────────────────────────────────────

interface AuthState {
  token: string | null
  studentId: string | null
  major: string
  isAdmin: boolean
  login: (studentId: string, major: string, isAdmin?: boolean) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      studentId: null,
      major: 'CS',
      isAdmin: false,
      login: async (studentId, major, isAdmin = false) => {
        const { accessToken } = await api.login(studentId, major, isAdmin)
        set({ token: accessToken, studentId, major, isAdmin })
      },
      logout: () => set({ token: null, studentId: null, isAdmin: false }),
    }),
    { name: 'su-auth' },
  ),
)

// ─── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  contextType?: string
  createdAt: Date
}

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  addMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => void
  appendToLast: (chunk: string) => void
  setStreaming: (v: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id: crypto.randomUUID(), createdAt: new Date() },
      ],
    })),
  appendToLast: (chunk) =>
    set((s) => {
      if (s.messages.length === 0) return s
      const msgs = [...s.messages]
      msgs[msgs.length - 1] = {
        ...msgs[msgs.length - 1],
        content: msgs[msgs.length - 1].content + chunk,
      }
      return { messages: msgs }
    }),
  setStreaming: (v) => set({ isStreaming: v }),
  clearMessages: () => set({ messages: [] }),
}))
