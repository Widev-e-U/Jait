import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy, Pencil, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Reasoning } from './reasoning'
import { ToolCallGroup, type ToolCallInfo } from './tool-call-card'

interface MessageProps {
  messageId?: string
  messageIndex?: number
  messageFromEnd?: number
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  thinkingDuration?: number
  toolCalls?: ToolCallInfo[]
  isStreaming?: boolean
  onOpenTerminal?: (terminalId: string | null) => void
  onEditMessage?: (
    messageId: string,
    newContent: string,
    messageIndex?: number,
    messageFromEnd?: number,
  ) => Promise<void> | void
}

export function Message({
  messageId,
  messageIndex,
  messageFromEnd,
  role,
  content,
  thinking,
  thinkingDuration,
  toolCalls,
  isStreaming,
  onOpenTerminal,
  onEditMessage,
}: MessageProps) {
  const isUser = role === 'user'
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [editWidthPx, setEditWidthPx] = useState<number | null>(null)
  const copyTimerRef = useRef<number | null>(null)
  const userBubbleRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isEditing) setDraft(content)
  }, [content, isEditing])

  const copyToClipboard = async () => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = content
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }

    setCopied(true)
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1200)
  }

  const canEdit = isUser && !!messageId && !!onEditMessage
  const canRetry = canEdit

  const startEditing = () => {
    const width = userBubbleRef.current?.getBoundingClientRect().width
    if (width && Number.isFinite(width)) {
      setEditWidthPx(Math.round(width))
    } else {
      setEditWidthPx(null)
    }
    setDraft(content)
    setIsEditing(true)
  }

  const sendFromMessage = async (nextContent: string) => {
    if (!canEdit || !messageId || !onEditMessage) return
    const next = nextContent.trim()
    if (!next) return
    await onEditMessage(messageId, next, messageIndex, messageFromEnd)
  }

  const handleSaveEdit = async () => {
    setIsSavingEdit(true)
    try {
      await sendFromMessage(draft)
      setIsEditing(false)
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleRetryFromHere = async () => {
    if (!canRetry) return
    setIsRetrying(true)
    try {
      await sendFromMessage(content)
    } finally {
      setIsRetrying(false)
    }
  }

  const renderActions = () => {
    if (!content || isEditing) return null
    return (
      <div
        className={cn(
          'absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1 rounded-md border bg-background/90 p-0.5 shadow-sm',
          'opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100',
          copied && 'opacity-100',
        )}
      >
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-sm"
            onClick={startEditing}
            aria-label="Edit message"
            title="Edit message"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {canRetry && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-sm"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void handleRetryFromHere()
            }}
            disabled={isRetrying}
            aria-label="Retry from this message"
            title="Retry from this message"
          >
            <RotateCcw className={cn('h-3.5 w-3.5', isRetrying && 'animate-spin')} />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={copyToClipboard}
          className="h-6 w-6 rounded-sm"
          aria-label={copied ? 'Copied' : 'Copy message'}
          title={copied ? 'Copied' : 'Copy message'}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('group/message flex gap-3 py-4', isUser && 'justify-end')}>
      <div className={cn('max-w-[85%] space-y-2', isUser && 'order-1')}>
        {!isUser && thinking && (
          <Reasoning
            content={thinking}
            isStreaming={!!isStreaming && !content}
            duration={thinkingDuration}
          />
        )}

        {toolCalls && toolCalls.length > 0 && (
          <ToolCallGroup calls={toolCalls} onOpenTerminal={onOpenTerminal} />
        )}

        {content ? (
          isUser && isEditing ? (
            <div
              className="max-w-full rounded-lg border bg-muted/40 p-3"
              style={editWidthPx ? { width: `${editWidthPx}px` } : undefined}
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.max(3, Math.min(10, draft.split('\n').length + 1))}
                className="w-full resize-y rounded-md border bg-background p-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { setIsEditing(false); setDraft(content); setEditWidthPx(null) }}
                  disabled={isSavingEdit}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => { void handleSaveEdit() }}
                  disabled={isSavingEdit || !draft.trim()}
                >
                  {isSavingEdit ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </div>
          ) : isUser ? (
            <div ref={userBubbleRef} className="relative rounded-lg px-4 py-3 text-base leading-relaxed whitespace-pre-wrap bg-muted">
              {content}
              {renderActions()}
            </div>
          ) : (
            <div className="relative">
              <div className="prose prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-code:before:content-none prose-code:after:content-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
              {renderActions()}
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
