import type { Metadata } from 'next'
import '../styles/su-theme.css'
import { AppShell } from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'SU Advisor',
  description: 'Sabancı Üniversitesi Yapay Zeka Destekli Ders & Mezuniyet Planlama Asistanı',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="h-screen overflow-hidden">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
