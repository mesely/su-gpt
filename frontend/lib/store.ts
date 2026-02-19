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
  isWizard?: boolean   // wizard system mesajı (seçim kartları için)
}

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  addMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => string
  appendToLast: (chunk: string) => void
  setStreaming: (v: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  addMessage: (msg) => {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    set((s) => ({
      messages: [...s.messages, { ...msg, id, createdAt: new Date() }],
    }))
    return id
  },
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

// ─── Course Selection (persist: aldığı dersler kayıtlı kalır) ─────────────────

interface CourseSelectionState {
  selectedCourses: string[]   // ["CS201", "CS301", ...]
  isComplete: boolean          // bir kere seçim yapıldı mı
  toggleCourse: (code: string) => void
  setCourses: (codes: string[]) => void
  markComplete: () => void
  reset: () => void
}

export const useCourseSelectionStore = create<CourseSelectionState>()(
  persist(
    (set) => ({
      selectedCourses: [],
      isComplete: false,
      toggleCourse: (code) =>
        set((s) => ({
          selectedCourses: s.selectedCourses.includes(code)
            ? s.selectedCourses.filter((c) => c !== code)
            : [...s.selectedCourses, code],
        })),
      setCourses: (codes) => set({ selectedCourses: codes }),
      markComplete: () => set({ isComplete: true }),
      reset: () => set({ selectedCourses: [], isComplete: false }),
    }),
    { name: 'su-courses' },
  ),
)
