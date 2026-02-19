'use client'
import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { LoginGate } from '@/components/LoginGate'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassBadge } from '@/components/ui/GlassBadge'
import { GlassModal } from '@/components/ui/GlassModal'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/lib/store'
import { api, WhatsappUploadResponse } from '@/lib/api'

// ─── WhatsApp Upload ──────────────────────────────────────────────────────────

function WhatsappPanel() {
  const { token } = useAuthStore()
  const [dragging, setDragging]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [preview, setPreview]     = useState<WhatsappUploadResponse | null>(null)
  const [batchId, setBatchId]     = useState<string | null>(null)
  const [status, setStatus]       = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    if (!token) return
    setLoading(true)
    setStatus('')
    try {
      const text = await file.text()
      const res  = await api.uploadWhatsapp(token, text, file.name)
      setPreview(res)
      setBatchId(res.batchId ?? (res as unknown as Record<string,string>).batch_id)
    } catch (e) {
      setStatus(`Hata: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const confirm = async (approved: boolean) => {
    if (!token || !batchId) return
    setLoading(true)
    try {
      const res = await api.confirmWhatsapp(token, batchId, approved)
      setStatus(approved
        ? `Onaylandı: ${res.ingested_count} yorum eklendi.`
        : 'Batch reddedildi ve silindi.')
      setPreview(null)
      setBatchId(null)
    } catch (e) {
      setStatus(`Hata: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const drop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.txt')) upload(file)
  }

  return (
    <GlassCard className="flex flex-col gap-4">
      <p className="font-semibold text-white">WhatsApp Yorum Yükleme</p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          dragging ? 'border-su-300 bg-su-500/10' : 'border-white/20 hover:border-white/40'
        }`}
      >
        <p className="text-3xl mb-2">💬</p>
        <p className="text-sm text-white/70">WhatsApp export .txt dosyasını buraya sürükle</p>
        <p className="text-xs text-white/40 mt-1">veya tıkla</p>
        <input
          ref={inputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
        />
      </div>

      {loading && <div className="flex justify-center"><Spinner /></div>}
      {status  && <p className="text-sm text-su-300">{status}</p>}

      {/* Preview */}
      {preview && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 text-sm text-white/60">
            <span>{preview.totalMessages} satır</span>
            <span>·</span>
            <span>{preview.parsedReviews} yorum parse edildi</span>
          </div>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {preview.preview.map((r, i) => (
              <div key={i} className="glass rounded-xl p-3 text-xs flex flex-col gap-1">
                <div className="flex gap-2 items-center">
                  <span className="text-su-300 font-medium">{r.instructorName || '—'}</span>
                  {r.courseCode && <GlassBadge label={r.courseCode} variant="su" />}
                  <GlassBadge
                    label={r.sentiment}
                    variant={r.sentiment === 'positive' ? 'success' : r.sentiment === 'negative' ? 'danger' : 'neutral'}
                  />
                </div>
                <p className="text-white/60 line-clamp-2">{r.anonymizedText}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => confirm(true)}
              disabled={loading}
              className="flex-1 bg-green-600/80 hover:bg-green-500 text-white text-sm rounded-xl py-2 transition-colors disabled:opacity-40"
            >
              Onayla ve kaydet
            </button>
            <button
              onClick={() => confirm(false)}
              disabled={loading}
              className="flex-1 bg-red-600/50 hover:bg-red-500/70 text-white text-sm rounded-xl py-2 transition-colors disabled:opacity-40"
            >
              Reddet
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  )
}

// ─── Exam Upload ──────────────────────────────────────────────────────────────

function ExamPanel() {
  const { token, studentId } = useAuthStore()
  const [form, setForm] = useState({
    courseCode: '', year: String(new Date().getFullYear()),
    semester: 'fall', type: 'midterm', fileName: '',
  })
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState('')

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !form.courseCode || !form.fileName) return
    setLoading(true)
    setStatus('')
    try {
      await api.uploadExam(token, {
        courseCode: form.courseCode.toUpperCase(),
        year:       parseInt(form.year),
        semester:   form.semester,
        type:       form.type,
        fileName:   form.fileName,
        uploadedBy: studentId ?? 'admin',
      })
      setStatus('Sınav başarıyla eklendi.')
      setForm((f) => ({ ...f, courseCode: '', fileName: '' }))
    } catch (e) {
      setStatus(`Hata: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassCard className="flex flex-col gap-4">
      <p className="font-semibold text-white">Sınav Kaydı Ekle</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Ders kodu (CS412)"
            value={form.courseCode}
            onChange={(e) => set('courseCode', e.target.value)}
            required
            className="bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-su-300"
          />
          <input
            type="number"
            placeholder="Yıl"
            value={form.year}
            onChange={(e) => set('year', e.target.value)}
            className="bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-su-300"
          />
          <select
            value={form.semester}
            onChange={(e) => set('semester', e.target.value)}
            className="bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-su-300"
          >
            <option value="fall"   className="bg-su-900">Güz</option>
            <option value="spring" className="bg-su-900">Bahar</option>
            <option value="summer" className="bg-su-900">Yaz</option>
          </select>
          <select
            value={form.type}
            onChange={(e) => set('type', e.target.value)}
            className="bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-su-300"
          >
            <option value="midterm" className="bg-su-900">Ara Sınav</option>
            <option value="final"   className="bg-su-900">Final</option>
            <option value="quiz"    className="bg-su-900">Quiz</option>
          </select>
        </div>
        <input
          placeholder="Dosya adı (cs412-midterm-2024.pdf)"
          value={form.fileName}
          onChange={(e) => set('fileName', e.target.value)}
          required
          className="bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-su-300"
        />
        {status && <p className="text-sm text-su-300">{status}</p>}
        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 bg-su-500 hover:bg-su-300 disabled:opacity-40 text-white text-sm rounded-xl py-2.5 transition-colors"
        >
          {loading ? <Spinner className="w-4 h-4" /> : 'Ekle'}
        </button>
      </form>
    </GlassCard>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { isAdmin } = useAuthStore()

  return (
    <LoginGate>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Admin Paneli</h1>
          <p className="text-sm text-white/50">WhatsApp yorum ve sınav yönetimi.</p>
        </div>
        {!isAdmin ? (
          <GlassCard className="text-center py-12">
            <p className="text-white/50">Bu sayfa sadece adminlere açıktır.</p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WhatsappPanel />
            <ExamPanel />
          </div>
        )}
      </div>
    </LoginGate>
  )
}
