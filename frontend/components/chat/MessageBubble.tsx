import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ChatMessage } from '@/lib/store'

interface MessageBubbleProps {
  message: ChatMessage
}

function IconUser({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconAI({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

// Inline markdown
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i} className="italic text-white/80">{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="bg-white/10 rounded px-1 font-mono text-su-300 text-[0.8em]">{part.slice(1, -1)}</code>
    return <span key={i}>{part}</span>
  })
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-base font-bold text-su-300 mt-3 mb-1 first:mt-0">
          {renderInline(line.slice(3))}
        </h2>
      )
      i++; continue
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-sm font-semibold text-white mt-2 mb-0.5">
          {renderInline(line.slice(4))}
        </h3>
      )
      i++; continue
    }
    if (line.trim() === '---') {
      elements.push(<hr key={i} className="border-white/10 my-2" />)
      i++; continue
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const listItems: React.ReactNode[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('• '))) {
        listItems.push(
          <li key={i} className="flex gap-1.5 items-baseline">
            <span className="text-su-300 shrink-0 text-xs">•</span>
            <span>{renderInline(lines[i].slice(2))}</span>
          </li>
        )
        i++
      }
      elements.push(<ul key={`ul-${i}`} className="flex flex-col gap-0.5 my-1 ml-1">{listItems}</ul>)
      continue
    }
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />)
      i++; continue
    }
    elements.push(<p key={i} className="leading-relaxed">{renderInline(line)}</p>)
    i++
  }

  return <>{elements}</>
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      className={cn('flex gap-3 max-w-[88%]', isUser ? 'self-end flex-row-reverse' : 'self-start')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Avatar */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1',
        isUser
          ? 'bg-su-500/80 text-white border border-su-300/30'
          : 'bg-white/8 text-su-300 border border-white/15',
      )}>
        {isUser ? <IconUser size={14} /> : <IconAI size={14} />}
      </div>

      {/* Bubble */}
      <div className={cn(
        'rounded-2xl px-4 py-3 text-sm',
        isUser
          ? 'bg-su-500/80 text-white rounded-tr-sm'
          : 'glass text-white/80 rounded-tl-sm',
      )}>
        {message.content
          ? (isUser
              ? <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
              : <MarkdownContent text={message.content} />
            )
          : (
            <span className="flex gap-1 items-center text-white/40 py-0.5">
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
          )
        }
      </div>
    </motion.div>
  )
}
