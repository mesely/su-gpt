import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ChatMessage } from '@/lib/store'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      className={cn('flex gap-3 max-w-[85%]', isUser ? 'self-end flex-row-reverse' : 'self-start')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1',
          isUser
            ? 'bg-su-500 text-white'
            : 'bg-white/10 text-su-300 border border-white/20',
        )}
      >
        {isUser ? 'S' : 'AI'}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-su-500/80 text-white rounded-tr-sm'
            : 'glass text-white/90 rounded-tl-sm',
        )}
      >
        {message.content || (
          <span className="flex gap-1 items-center text-white/40">
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </motion.div>
  )
}
