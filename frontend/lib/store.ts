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

export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: ChatMessage[]
  isStreaming: boolean
  newSession: () => string
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  addMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => string
  appendToLast: (chunk: string) => void
  setStreaming: (v: boolean) => void
  setActiveTitle: (title: string) => void
  clearMessages: () => void
}

function uid() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function titleFromUserText(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Yeni sohbet'
  return cleaned.length > 56 ? `${cleaned.slice(0, 56)}...` : cleaned
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  isStreaming: false,
  newSession: () => {
    const id = uid()
    const now = new Date().toISOString()
    const session: ChatSession = {
      id,
      title: 'Yeni sohbet',
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    set((s) => ({ sessions: [session, ...s.sessions], activeSessionId: id, messages: [] }))
    return id
  },
  switchSession: (id) =>
    set((s) => {
      const found = s.sessions.find((x) => x.id === id)
      if (!found) return s
      return { activeSessionId: id, messages: found.messages }
    }),
  deleteSession: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id)
      if (s.activeSessionId !== id) return { sessions }
      const next = sessions[0]
      return {
        sessions,
        activeSessionId: next?.id ?? null,
        messages: next?.messages ?? [],
      }
    }),
  addMessage: (msg) => {
    const id = uid()
    const now = new Date()
    const nowIso = now.toISOString()
    const message: ChatMessage = { ...msg, id, createdAt: now }

    set((s) => {
      let activeId = s.activeSessionId
      let sessions = [...s.sessions]
      if (!activeId) {
        activeId = uid()
        sessions = [{
          id: activeId,
          title: 'Yeni sohbet',
          createdAt: nowIso,
          updatedAt: nowIso,
          messages: [],
        }, ...sessions]
      }
      const idx = sessions.findIndex((x) => x.id === activeId)
      if (idx < 0) return s

      const current = sessions[idx]
      const newMessages = [...current.messages, message]
      const hasAnyUser = newMessages.some((m) => m.role === 'user')
      const title = current.title === 'Yeni sohbet' && msg.role === 'user'
        ? titleFromUserText(msg.content)
        : current.title

      sessions[idx] = { ...current, title: hasAnyUser ? title : current.title, updatedAt: nowIso, messages: newMessages }
      sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

      return { sessions, activeSessionId: activeId, messages: newMessages }
    })
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
      if (!s.activeSessionId) return { messages: msgs }
      const sessions = s.sessions.map((x) =>
        x.id === s.activeSessionId
          ? { ...x, updatedAt: new Date().toISOString(), messages: msgs }
          : x,
      ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return { messages: msgs, sessions }
    }),
  setStreaming: (v) => set({ isStreaming: v }),
  setActiveTitle: (title) =>
    set((s) => {
      if (!s.activeSessionId) return s
      const sessions = s.sessions.map((x) =>
        x.id === s.activeSessionId ? { ...x, title, updatedAt: new Date().toISOString() } : x,
      ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return { sessions }
    }),
  clearMessages: () =>
    set((s) => {
      if (!s.activeSessionId) return { messages: [] }
      const sessions = s.sessions.map((x) =>
        x.id === s.activeSessionId
          ? { ...x, messages: [], updatedAt: new Date().toISOString(), title: 'Yeni sohbet' }
          : x,
      )
      return { messages: [], sessions }
    }),
    }),
    { name: 'su-chat' },
  ),
)

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
