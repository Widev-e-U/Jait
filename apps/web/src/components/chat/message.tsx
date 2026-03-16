import { memo, useMemo, useEffect, useRef, useState } from 'react'
import { markdownLookBack } from '@llm-ui/markdown'
import { useLLMOutput, type LLMOutputComponent } from '@llm-ui/react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy, Pencil, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FileIcon } from '@/components/icons/file-icons'
import { Reasoning } from './reasoning'
import { ToolCallGroup, type ToolCallInfo } from './tool-call-card'
import type { MessageSegment } from '@/hooks/useChat'
import { parseWorkspaceLinkTarget } from '@/lib/workspace-links'

/** Parse "Referenced files:" block from message content and return clean text + file paths. */
function parseReferencedFiles(content: string): { text: string; files: { path: string; name: string }[] } {
  const marker = '\nReferenced files:\n'
  const idx = content.indexOf(marker)
  if (idx === -1) return { text: content, files: [] }

  const text = content.slice(0, idx).trimEnd()
  const refBlock = content.slice(idx + marker.length)
  const files: { path: string; name: string }[] = []
  // Each file starts with "- path/to/file"
  for (const line of refBlock.split('\n')) {
    const m = line.match(/^- (.+)$/)
    if (m) {
      const path = m[1].trim()
      files.push({ path, name: path.split('/').pop() ?? path })
    }
  }
  return { text, files }
}

interface MessageProps {
  messageId?: string
  messageIndex?: number
  messageFromEnd?: number
  role: 'user' | 'assistant'
  content: string
  /** Clean display text (without appended file contents). Falls back to parsing content. */
  displayContent?: string
  /** Files the user referenced via @ chips — rendered as inline badges. */
  referencedFiles?: { path: string; name: string }[]
  thinking?: string
  thinkingDuration?: number
  toolCalls?: ToolCallInfo[]
  /** Ordered interleaving of text and tool-call groups (from live streaming). */
  segments?: MessageSegment[]
  isStreaming?: boolean
  compact?: boolean
  preferLlmUi?: boolean
  onOpenTerminal?: (terminalId: string | null) => void
  onEditMessage?: (
    messageId: string,
    newContent: string,
    messageIndex?: number,
    messageFromEnd?: number,
  ) => Promise<void> | void
  onOpenPath?: (path: string, line?: number, column?: number) => Promise<void> | void
}

const USER_MESSAGE_MIN_WIDTH_PX = 320
const USER_MESSAGE_MIN_WIDTH_CLASS = 'min-w-[min(20rem,calc(100vw-5rem))]'

function proseClassName(compact?: boolean) {
  return compact
    ? 'prose dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-pre:bg-muted prose-pre:border prose-pre:max-w-full prose-pre:overflow-x-auto prose-code:before:content-none prose-code:after:content-none prose-sm prose-p:leading-normal'
    : 'prose dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-pre:bg-muted prose-pre:border prose-pre:max-w-full prose-pre:overflow-x-auto prose-code:before:content-none prose-code:after:content-none prose-base prose-p:leading-relaxed'
}

function buildMarkdownComponents(
  onOpenPath?: MessageProps['onOpenPath'],
): Components | undefined {
  if (!onOpenPath) return undefined

  return {
    a: ({ href, children, ref: _ref, ...props }) => {
      const target = parseWorkspaceLinkTarget(href)
      if (!target) {
        return <a href={href} {...props}>{children}</a>
      }

      return (
        <a
          href={href}
          {...props}
          onClick={(event) => {
            event.preventDefault()
            void onOpenPath(target.path, target.line, target.column)
          }}
        >
          {children}
        </a>
      )
    },
  }
}

function StaticMarkdown({
  content,
  compact,
  onOpenPath,
}: {
  content: string
  compact?: boolean
  onOpenPath?: MessageProps['onOpenPath']
}) {
  const components = useMemo(() => buildMarkdownComponents(onOpenPath), [onOpenPath])
  return (
    <div className={proseClassName(compact)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
    </div>
  )
}

function StreamingMarkdown({
  content,
  compact,
  onOpenPath,
}: {
  content: string
  compact?: boolean
  onOpenPath?: MessageProps['onOpenPath']
}) {
  const components = useMemo(() => buildMarkdownComponents(onOpenPath), [onOpenPath])
  const MarkdownBlock: LLMOutputComponent = ({ blockMatch }) => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{blockMatch.output}</ReactMarkdown>
  )
  const { blockMatches } = useLLMOutput({
    llmOutput: content,
    blocks: [],
    fallbackBlock: {
      component: MarkdownBlock,
      lookBack: markdownLookBack(),
    },
    isStreamFinished: false,
  })

  return (
    <div className={proseClassName(compact)}>
      {blockMatches.map((blockMatch, index) => {
        const Component = blockMatch.block.component
        return <Component key={index} blockMatch={blockMatch} />
      })}
    </div>
  )
}

function AssistantMarkdown({
  content,
  compact,
  isStreaming,
  preferLlmUi,
  onOpenPath,
}: {
  content: string
  compact?: boolean
  isStreaming?: boolean
  preferLlmUi?: boolean
  onOpenPath?: MessageProps['onOpenPath']
}) {
  if (preferLlmUi && isStreaming) {
    return <StreamingMarkdown content={content} compact={compact} onOpenPath={onOpenPath} />
  }

  return <StaticMarkdown content={content} compact={compact} onOpenPath={onOpenPath} />
}

function MessageInner({
  messageId,
  messageIndex,
  messageFromEnd,
  role,
  content,
  displayContent: displayContentProp,
  referencedFiles: referencedFilesProp,
  thinking,
  thinkingDuration,
  toolCalls,
  segments,
  isStreaming,
  compact,
  preferLlmUi,
  onOpenTerminal,
  onEditMessage,
  onOpenPath,
}: MessageProps) {
  const isUser = role === 'user'

  // Resolve display text & referenced files:
  // - If props carry them, use directly (new messages)
  // - Otherwise parse from content (historical messages)
  const { userDisplayText, userFiles } = useMemo(() => {
    if (!isUser) return { userDisplayText: content, userFiles: [] as { path: string; name: string }[] }
    if (displayContentProp) {
      return { userDisplayText: displayContentProp, userFiles: referencedFilesProp ?? [] }
    }
    const parsed = parseReferencedFiles(content)
    return { userDisplayText: parsed.text, userFiles: parsed.files }
  }, [isUser, content, displayContentProp, referencedFilesProp])

  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(userDisplayText)
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
    if (!isEditing) setDraft(userDisplayText)
  }, [userDisplayText, isEditing])

  /** Build copyable text including tool calls when present */
  const buildCopyText = (): string => {
    const parts: string[] = []

    if (toolCalls && toolCalls.length > 0) {
      for (const call of toolCalls) {
        const label = call.tool.replace(/_/g, '.')
        const summary = Object.entries(call.args)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(', ')
        const status = call.status === 'success' ? '\u2713' : call.status === 'error' ? '\u2717' : '\u2026'
        const duration = call.completedAt && call.startedAt
          ? `${((call.completedAt - call.startedAt) / 1000).toFixed(1)}s`
          : ''

        parts.push(`[${status} ${label}] ${summary}`)
        if (call.result?.message) {
          const msg = call.result.message.length > 500
            ? call.result.message.slice(0, 500) + '\u2026'
            : call.result.message
          parts.push(msg)
        }
        if (duration) parts.push(`Duration: ${duration}`)
        parts.push('')
      }
    }

    if (content) parts.push(content)
    return parts.join('\n').trim()
  }

  const copyToClipboard = async () => {
    const text = buildCopyText()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = text
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
      const viewportWidth = typeof window === 'undefined' ? USER_MESSAGE_MIN_WIDTH_PX : Math.max(window.innerWidth - 80, 0)
      const minWidth = Math.min(USER_MESSAGE_MIN_WIDTH_PX, viewportWidth)
      setEditWidthPx(Math.max(Math.round(width), minWidth))
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

  const renderActions = (outsideBubble?: boolean) => {
    if (!content || isEditing) return null
    return (
      <div
        className={cn(
          'absolute z-10 flex items-center gap-1 rounded-md border bg-background/90 p-0.5 shadow-sm',
          outsideBubble ? 'right-0 top-full mt-1' : 'bottom-1.5 right-1.5',
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
    <div className={cn('group/message flex gap-3', compact ? 'py-2' : 'py-4', isUser && 'justify-end')}>
      <div className={cn('min-w-0 max-w-[85%] space-y-2', isUser && 'order-1')}>
        {!isUser && thinking && (
          <Reasoning
            content={thinking}
            isStreaming={!!isStreaming && !content}
            duration={thinkingDuration}
          />
        )}

        {/* Render segments in arrival order when available (live-streamed messages) */}
        {!isUser && segments && segments.length > 0 ? (
          <>
            {segments.map((seg, i) => {
              if (seg.type === 'toolGroup') {
                const calls = (toolCalls ?? []).filter(tc => seg.callIds.includes(tc.callId))
                return calls.length > 0 ? (
                  <ToolCallGroup key={`tg-${i}`} calls={calls} onOpenTerminal={onOpenTerminal} />
                ) : null
              }
              // text segment
              return seg.content.trim() ? (
                <div key={`ts-${i}`}>
                  <AssistantMarkdown
                    content={seg.content}
                    compact={compact}
                    isStreaming={!!isStreaming && i === segments.length - 1}
                    preferLlmUi={preferLlmUi}
                    onOpenPath={onOpenPath}
                  />
                </div>
              ) : null
            })}
            {/* Streaming dots when content hasn't started yet */}
            {isStreaming && !content && !segments.some(s => s.type === 'text' && s.content.trim()) && (
              <div className="flex gap-1 py-2">
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            )}
            {renderActions()}
          </>
        ) : (
          /* Fallback: old layout for historical messages without segments */
          <>
            {toolCalls && toolCalls.length > 0 && (
              <ToolCallGroup calls={toolCalls} onOpenTerminal={onOpenTerminal} />
            )}

        {content ? (
          isUser && isEditing ? (
            <div
              className={cn('max-w-full rounded-lg border bg-muted/40 p-3', USER_MESSAGE_MIN_WIDTH_CLASS)}
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
            <div className={cn('relative w-fit max-w-full pb-8', USER_MESSAGE_MIN_WIDTH_CLASS)}>
              <div ref={userBubbleRef} className={cn(
                'min-w-0 rounded-lg bg-muted px-4 py-3 break-words [overflow-wrap:anywhere]',
                compact ? 'text-sm leading-normal' : 'text-base leading-relaxed',
              )}>
                <div className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{userDisplayText}</div>
                {userFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 border-t border-foreground/5 pt-2">
                    {userFiles.map((f) => (
                      <span
                        key={f.path}
                        className="inline-flex items-center gap-1 rounded bg-background/60 px-1.5 py-0.5 text-[12px] leading-tight text-muted-foreground select-none"
                        title={f.path}
                      >
                        <FileIcon filename={f.name} className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate max-w-[180px]">{f.name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {renderActions(true)}
            </div>
          ) : (
            <div className="relative min-w-0 break-words [overflow-wrap:anywhere]">
              <AssistantMarkdown
                content={content}
                compact={compact}
                isStreaming={isStreaming}
                preferLlmUi={preferLlmUi}
                onOpenPath={onOpenPath}
              />
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
          </>
        )}
      </div>
    </div>
  )
}

export const Message = memo(MessageInner)
Message.displayName = 'Message'
