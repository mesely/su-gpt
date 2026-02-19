import type { Metadata } from 'next'
import '../styles/su-theme.css'
import { Sidebar } from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'SU Advisor',
  description: 'Sabancı Üniversitesi Yapay Zeka Destekli Ders & Mezuniyet Planlama Asistanı',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </body>
    </html>
  )
}
