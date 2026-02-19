'use client'
import { LoginGate } from '@/components/LoginGate'
import { ChatWindow } from '@/components/chat/ChatWindow'

export default function HomePage() {
  return (
    <LoginGate>
      <div className="h-full">
        <div className="h-full min-h-0">
          <ChatWindow />
        </div>
      </div>
    </LoginGate>
  )
}
