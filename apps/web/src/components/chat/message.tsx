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
import { resolveChatImageUrl } from '@/lib/chat-image-url'
import { parseWorkspaceLinkTarget } from '@/lib/workspace-links'
import {
  JAIT_REF_MIME,
  buildFallbackUserMessageSegments,
  parseLegacyReferencedFilesBlock,
  serializeUserMessageSegmentsForClipboard,
  serializeUserMessageSegmentsToMarkdown,
  type UserMessageSegment,
} from '@/lib/user-message-segments'

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
  /** Ordered text/file segments for consistent rendering and editing. */
  displaySegments?: UserMessageSegment[]
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
    metadata?: {
      referencedFiles?: { path: string; name: string }[]
      displaySegments?: UserMessageSegment[]
    },
  ) => Promise<void> | void
  onStartEditMessage?: (
    messageId: string,
    currentContent: string,
    messageIndex?: number,
    messageFromEnd?: number,
    metadata?: {
      referencedFiles?: { path: string; name: string }[]
      displaySegments?: UserMessageSegment[]
    },
  ) => void
  onOpenPath?: (path: string, line?: number, column?: number) => Promise<void> | void
  onOpenDiff?: (filePath: string) => void
}

const USER_MESSAGE_MIN_WIDTH_CLASS = 'min-w-[min(20rem,calc(100vw-5rem))]'

function proseClassName(compact?: boolean) {
  return compact
    ? 'prose dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-pre:bg-muted prose-pre:border prose-pre:max-w-full prose-pre:overflow-x-auto prose-code:before:content-none prose-code:after:content-none prose-sm prose-p:leading-normal'
    : 'prose dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-pre:bg-muted prose-pre:border prose-pre:max-w-full prose-pre:overflow-x-auto prose-code:before:content-none prose-code:after:content-none prose-base prose-p:leading-relaxed'
}

function getFileLinkLabel(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? normalized
}

function WorkspacePathLink({
  href,
  target,
  onOpenPath,
}: {
  href?: string
  target: NonNullable<ReturnType<typeof parseWorkspaceLinkTarget>>
  onOpenPath: NonNullable<MessageProps['onOpenPath']>
}) {
  const fileName = getFileLinkLabel(target.path)
  const location = target.line
    ? `L${target.line}${target.column ? `:${target.column}` : ''}`
    : null

  return (
    <a
      href={href}
      className={cn(
        'not-prose inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/45 px-2 py-1 align-middle text-[12px] font-medium leading-none text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
      title={target.path}
      onClick={(event) => {
        event.preventDefault()
        void onOpenPath(target.path, target.line, target.column)
      }}
    >
      <FileIcon filename={fileName} className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[220px] truncate">{fileName}</span>
      {location ? (
        <span className="shrink-0 rounded bg-background/80 px-1 py-0.5 text-[10px] text-muted-foreground">
          {location}
        </span>
      ) : null}
    </a>
  )
}

function buildMarkdownComponents(
  onOpenPath?: MessageProps['onOpenPath'],
): Components | undefined {
  return {
    code: ({ node, className, children, ref: _ref, ...props }: any) => {
      const inline = node?.position?.start.line === node?.position?.end.line && !className
      if (!inline) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }

      return (
        <code
          className={cn(
            'not-prose inline-flex max-w-full items-center rounded-md border border-border/70 bg-muted/45 px-2 py-1 align-middle font-mono text-[12px] font-medium leading-none text-foreground',
            'shadow-[inset_0_1px_0_hsl(var(--background)/0.55)]',
          )}
          {...props}
        >
          <span className="max-w-[32rem] truncate sm:max-w-[40rem]">{children}</span>
        </code>
      )
    },
    a: ({ href, ref: _ref, ...props }) => {
      if (!onOpenPath) {
        return <a href={href} {...props}>{props.children}</a>
      }

      const target = parseWorkspaceLinkTarget(href)
      if (!target) {
        return <a href={href} {...props}>{props.children}</a>
      }

      return (
        <WorkspacePathLink href={href} target={target} onOpenPath={onOpenPath} />
      )
    },
    img: ({ src, alt, ref: _ref, ...props }) => {
      const resolvedSrc = typeof src === 'string' ? resolveChatImageUrl(src) : null
      if (!resolvedSrc) {
        return (
          <span className="inline-flex rounded-md border border-dashed border-border/70 px-2 py-1 text-xs text-muted-foreground">
            image unavailable
          </span>
        )
      }

      return (
        <a href={resolvedSrc} target="_blank" rel="noreferrer" className="not-prose block overflow-hidden rounded-xl border border-border/60 bg-muted/20 no-underline">
          <img
            src={resolvedSrc}
            alt={alt ?? 'Chat image'}
            loading="lazy"
            className="max-h-[28rem] w-full object-contain bg-background/80"
            {...props}
          />
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

const AssistantMarkdown = memo(function AssistantMarkdown({
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
})
AssistantMarkdown.displayName = 'AssistantMarkdown'

function MessageInner({
  messageId,
  messageIndex,
  messageFromEnd,
  role,
  content,
  displayContent: displayContentProp,
  referencedFiles: referencedFilesProp,
  displaySegments: displaySegmentsProp,
  thinking,
  thinkingDuration,
  toolCalls,
  segments,
  isStreaming,
  compact,
  preferLlmUi,
  onOpenTerminal,
  onEditMessage,
  onStartEditMessage,
  onOpenPath,
  onOpenDiff,
}: MessageProps) {
  const isUser = role === 'user'

  // Resolve display text & referenced files:
  // - If props carry them, use directly (new messages)
  // - Otherwise parse from content (historical messages)
  const { userDisplayText, userDisplaySegments } = useMemo(() => {
    if (!isUser) return {
      userDisplayText: content,
        userDisplaySegments: [] as UserMessageSegment[],
      }
    if (displaySegmentsProp?.length) {
      return {
        userDisplayText: userMessageTextFromSegments(displaySegmentsProp),
        userDisplaySegments: displaySegmentsProp,
      }
    }
    if (displayContentProp) {
      const fallbackSegments = buildFallbackUserMessageSegments(displayContentProp, referencedFilesProp)
      return { userDisplayText: displayContentProp, userDisplaySegments: fallbackSegments }
    }
    const parsed = parseLegacyReferencedFilesBlock(content)
    return { userDisplayText: parsed.text, userDisplaySegments: parsed.displaySegments }
  }, [isUser, content, displayContentProp, referencedFilesProp, displaySegmentsProp])

  const [copied, setCopied] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const copyTimerRef = useRef<number | null>(null)
  const userBubbleRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

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

    if (content) {
      parts.push(isUser ? serializeUserMessageSegmentsToMarkdown(userDisplaySegments) || userDisplayText : content)
    }
    return parts.join('\n').trim()
  }

  const copyToClipboard = async () => {
    const text = buildCopyText()
    if (!text) return
    const clipboardPayload = isUser ? serializeUserMessageSegmentsForClipboard(userDisplaySegments) : null
    try {
      if (clipboardPayload && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            [JAIT_REF_MIME]: new Blob([clipboardPayload], { type: JAIT_REF_MIME }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(text)
      }
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
    if (!messageId || !onStartEditMessage) return
    onStartEditMessage(messageId, userDisplayText, messageIndex, messageFromEnd, {
      referencedFiles: userDisplaySegments
        .filter((segment): segment is Extract<UserMessageSegment, { type: 'file' }> => segment.type === 'file')
        .map((segment) => ({ path: segment.path, name: segment.name })),
      displaySegments: userDisplaySegments,
    })
  }

  const handleUserBubbleClick = () => {
    if (!canEdit) return
    const selection = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : ''
    if (selection) return
    startEditing()
  }

  const sendFromMessage = async (nextContent: string, nextSegments?: UserMessageSegment[]) => {
    if (!canEdit || !messageId || !onEditMessage) return
    const next = nextContent.trim()
    if (!next) return
    await onEditMessage(messageId, next, messageIndex, messageFromEnd, {
      referencedFiles: (nextSegments ?? userDisplaySegments)
        .filter((segment): segment is Extract<UserMessageSegment, { type: 'file' }> => segment.type === 'file')
        .map((segment) => ({ path: segment.path, name: segment.name })),
      displaySegments: nextSegments ?? userDisplaySegments,
    })
  }

  const handleRetryFromHere = async () => {
    if (!canRetry) return
    setIsRetrying(true)
    try {
      await sendFromMessage(userDisplayText, userDisplaySegments)
    } finally {
      setIsRetrying(false)
    }
  }

  const renderActions = (outsideBubble?: boolean) => {
    if (!content) return null
    return (
      <div
        className={cn(
          'absolute z-10 flex items-center gap-1 rounded-md border bg-background/90 p-0.5 shadow-sm',
          outsideBubble ? 'right-0 top-full mt-0.5' : 'bottom-1.5 right-1.5',
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
                  <ToolCallGroup key={`tg-${i}`} calls={calls} onOpenTerminal={onOpenTerminal} onOpenDiff={onOpenDiff} />
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
              <ToolCallGroup calls={toolCalls} onOpenTerminal={onOpenTerminal} onOpenDiff={onOpenDiff} />
            )}

        {content ? (
          isUser ? (
            <div className={cn('relative w-fit max-w-full', USER_MESSAGE_MIN_WIDTH_CLASS)}>
              <div
                ref={userBubbleRef}
                className={cn(
                'min-w-0 rounded-lg bg-muted px-4 py-3 break-words [overflow-wrap:anywhere]',
                canEdit && 'cursor-text transition-colors hover:bg-muted/80',
                compact ? 'text-sm leading-normal' : 'text-base leading-relaxed',
              )}
                onClick={handleUserBubbleClick}
                title={canEdit ? 'Click to edit message' : undefined}
              >
                <div className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {userDisplaySegments.length > 0 ? userDisplaySegments.map((segment, index) => (
                    segment.type === 'text' ? (
                      <span key={`text-${index}`}>{segment.text}</span>
                    ) : (
                      <span
                        key={`${segment.path}-${index}`}
                        className="mx-[2px] inline-flex items-center gap-1 rounded bg-background/60 px-1.5 py-0.5 text-[12px] leading-tight text-muted-foreground align-baseline select-none"
                        title={segment.path}
                      >
                        <FileIcon filename={segment.name} className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate max-w-[180px]">{segment.name}</span>
                      </span>
                    )
                  )) : userDisplayText}
                </div>
              </div>
              {renderActions()}
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
