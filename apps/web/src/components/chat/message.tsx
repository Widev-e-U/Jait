import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Reasoning } from './reasoning'
import { ToolCallGroup, type ToolCallInfo } from './tool-call-card'

interface MessageProps {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  thinkingDuration?: number
  toolCalls?: ToolCallInfo[]
  isStreaming?: boolean
}

export function Message({ role, content, thinking, thinkingDuration, toolCalls, isStreaming }: MessageProps) {
  const isUser = role === 'user'

  return (
    <div className={cn('flex gap-3 py-4', isUser && 'justify-end')}>
      <div className={cn('max-w-[85%] space-y-2', isUser && 'order-1')}>
        {!isUser && thinking && (
          <Reasoning
            content={thinking}
            isStreaming={!!isStreaming && !content}
            duration={thinkingDuration}
          />
        )}

        {toolCalls && toolCalls.length > 0 && (
          <ToolCallGroup calls={toolCalls} />
        )}

        {content ? (
          isUser ? (
            <div className="rounded-lg px-4 py-3 text-base leading-relaxed whitespace-pre-wrap bg-muted">
              {content}
            </div>
          ) : (
            <div className="prose prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-code:before:content-none prose-code:after:content-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          )
        ) : isStreaming && !thinking ? (
          <div className="flex gap-1 py-2">
            <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
