import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ChatMessage } from '@/lib/store'

interface MessageBubbleProps {
  message: ChatMessage
}

// Basit satır içi markdown: **bold**, *italic*, `code`
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

// Block-level markdown renderer
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ## Başlık
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

    // --- yatay çizgi
    if (line.trim() === '---') {
      elements.push(<hr key={i} className="border-white/10 my-2" />)
      i++; continue
    }

    // - liste öğesi
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

    // Boş satır
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />)
      i++; continue
    }

    // Normal paragraf
    elements.push(
      <p key={i} className="leading-relaxed">
        {renderInline(line)}
      </p>
    )
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
          'rounded-2xl px-4 py-3 text-sm',
          isUser
            ? 'bg-su-500/80 text-white rounded-tr-sm'
            : 'glass text-white/80 rounded-tl-sm',
        )}
      >
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
