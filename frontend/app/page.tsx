'use client'
import { LoginGate } from '@/components/LoginGate'
import { ChatWindow } from '@/components/chat/ChatWindow'

export default function HomePage() {
  return (
    <LoginGate>
      <div className="h-full flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Chat</h1>
          <p className="text-sm text-white/50">Ders, mezuniyet ve dönem planı hakkında soru sor.</p>
        </div>
        <div className="flex-1 min-h-0">
          <ChatWindow />
        </div>
      </div>
    </LoginGate>
  )
}
