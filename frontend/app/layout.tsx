import type { Metadata, Viewport } from 'next'
import '../styles/su-theme.css'
import { AppShell } from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'SU Advisor',
  description: 'Sabanci Universitesi Yapay Zeka Destekli Ders & Mezuniyet Planlama Asistani',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="overflow-hidden" style={{ height: '100dvh' }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
