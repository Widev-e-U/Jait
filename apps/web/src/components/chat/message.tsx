import { memo, useMemo, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { markdownLookBack } from '@llm-ui/markdown'
import { useLLMOutput, type LLMOutputComponent } from '@llm-ui/react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { codeToHtml } from 'shiki/bundle/web'
import { Check, Copy, Pencil, RotateCcw, X } from 'lucide-react'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block'
import {
  Message as AIMessage,
  MessageAction,
  MessageActions,
  MessageContent as AIMessageContent,
} from '@/components/ai-elements/message'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FileIcon } from '@/components/icons/file-icons'
import { Reasoning } from './reasoning'
import { createUserMessageEditSubmission, isUserMessageEditUnchanged } from './message-edit'
import { PromptInput, type PromptInputHandle } from './prompt-input'
import { AgentToolCallWrapper, ToolCallGroup, type ToolCallInfo } from './tool-call-card'
import type { MessageSegment } from '@/hooks/useChat'
import type { ProviderId, RuntimeMode } from '@/lib/agents-api'
import type { ChatMode } from './mode-selector'
import type { SendTarget } from './send-target-selector'
import type { ReferencedFile } from './prompt-input'
import type { RepositoryRuntimeInfo } from '@/lib/automation-repositories'
import type { SessionInfo } from '@/hooks/useChat'
import { resolveChatImageUrl } from '@/lib/chat-image-url'
import { parseWorkspaceLinkTarget } from '@/lib/workspace-links'
import {
  JAIT_REF_MIME,
  buildFallbackUserMessageSegments,
  normalizeUserMessageSegments,
  parseLegacyReferencedFilesBlock,
  userMessageTextFromSegments,
  userReferencedFilesFromSegments,
  serializeUserMessageSegmentsForClipboard,
  serializeUserMessageSegmentsToMarkdown,
  type UserMessageSegment,
} from '@/lib/user-message-segments'

const MIN_AGENT_TOOL_CALLS_FOR_WRAPPER = 3

export function shouldUseAgentToolCallWrapper(provider: ProviderId | undefined, calls: ToolCallInfo[]): provider is Exclude<ProviderId, 'jait'> {
  return Boolean(provider && provider !== 'jait' && calls.length >= MIN_AGENT_TOOL_CALLS_FOR_WRAPPER)
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
  /** Ordered text/file segments for consistent rendering and editing. */
  displaySegments?: UserMessageSegment[]
  attachments?: { name: string; mimeType: string; data: string; preview?: string }[]
  thinking?: string
  thinkingDuration?: number
  toolCalls?: ToolCallInfo[]
  /** Ordered interleaving of text and tool-call groups (from live streaming). */
  segments?: MessageSegment[]
  isStreaming?: boolean
  compact?: boolean
  preferLlmUi?: boolean
  /** Active chat provider. Non-Jait providers still use inline tool groups. */
  provider?: ProviderId
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
  editComposer?: {
    onVoiceInput?: () => void
    voiceRecording?: boolean
    voiceLevels?: number[]
    voiceTranscribing?: boolean
    onVoiceStop?: () => void
    mode?: ChatMode
    onModeChange?: (mode: ChatMode) => void
    sendTarget?: SendTarget
    onSendTargetChange?: (target: SendTarget) => void
    provider?: ProviderId
    onProviderChange?: (provider: ProviderId) => void
    providerRuntimeMode?: RuntimeMode
    onProviderRuntimeModeChange?: (mode: RuntimeMode) => void
    cliModel?: string | null
    onCliModelChange?: (model: string | null) => void
    repoRuntime?: RepositoryRuntimeInfo | null
    onMoveToGateway?: () => void
    sessionInfo?: SessionInfo | null
    workspaceNodeId?: string
    availableFiles?: ReferencedFile[]
    onSearchFiles?: (query: string, limit: number, signal?: AbortSignal) => Promise<ReferencedFile[]>
    workspaceOpen?: boolean
    footerLeadingContent?: ReactNode
  }
  onOpenPath?: (path: string, line?: number, column?: number) => Promise<void> | void
  onOpenDiff?: (filePath: string) => void
}

const CODE_HTML_MATCHER = /<pre[^>]*><code>([\s\S]*)<\/code><\/pre>/

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </span>
  )
}

function normalizeCodeLanguage(language: string): string {
  const normalized = language.toLowerCase()
  if (!normalized || normalized === 'text' || normalized === 'plain') return 'txt'
  if (normalized === 'shell' || normalized === 'sh') return 'bash'
  return normalized
}

function HighlightedCode({
  code,
  language,
  className,
}: {
  code: string
  language: string
  className?: string
}) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const highlight = async () => {
      const theme = document.documentElement.classList.contains('dark') ? 'github-dark' : 'github-light'
      const normalizedLanguage = normalizeCodeLanguage(language)

      try {
        const html = await codeToHtml(code, {
          lang: normalizedLanguage as any,
          theme,
        })
        if (cancelled) return
        setHighlightedHtml(html.match(CODE_HTML_MATCHER)?.[1] ?? null)
      } catch {
        try {
          const html = await codeToHtml(code, {
            lang: 'txt' as any,
            theme,
          })
          if (cancelled) return
          setHighlightedHtml(html.match(CODE_HTML_MATCHER)?.[1] ?? null)
        } catch {
          if (!cancelled) setHighlightedHtml(null)
        }
      }
    }

    void highlight()
    return () => {
      cancelled = true
    }
  }, [code, language])

  if (!highlightedHtml) {
    return <code className={cn(className, 'whitespace-pre')}>{code}</code>
  }

  return <code className={cn(className, 'whitespace-pre')} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
}

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
    pre: ({ children }) => <>{children}</>,
    code: ({ node, className, children, ref: _ref, ...props }: any) => {
      const inline = node?.position?.start.line === node?.position?.end.line && !className
      if (!inline) {
        const language = typeof className === 'string'
          ? className.replace(/^language-/, '').split(' ')[0] || 'text'
          : 'text'
        const code = String(children ?? '').replace(/\n$/, '')
        return (
          <CodeBlock code={code} language={language}>
            <CodeBlockHeader>
              <CodeBlockTitle>
                <CodeBlockFilename>{language}</CodeBlockFilename>
              </CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton />
              </CodeBlockActions>
            </CodeBlockHeader>
            <div className="overflow-x-auto px-3 py-2 text-sm">
              <HighlightedCode code={code} language={language} className={className} />
            </div>
          </CodeBlock>
        )
      }

      return (
        <code
          className={cn(
            'not-prose inline-flex max-w-full items-baseline rounded-md border border-border/70 bg-muted/45 px-2 py-1.5 align-middle font-mono text-[12px] font-medium leading-[1.2] text-foreground',
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
        return (
          <a href={href} {...props}>
            {props.children}
          </a>
        )
      }

      const target = parseWorkspaceLinkTarget(href)
      if (!target) {
        return (
          <a href={href} {...props}>
            {props.children}
          </a>
        )
      }

      return <WorkspacePathLink href={href} target={target} onOpenPath={onOpenPath} />
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
        <a
          href={resolvedSrc}
          target="_blank"
          rel="noreferrer"
          className="not-prose block overflow-hidden rounded-xl border border-border/60 bg-muted/20 no-underline"
        >
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
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
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {blockMatch.output}
    </ReactMarkdown>
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
  attachments: attachmentsProp,
  thinking,
  thinkingDuration,
  toolCalls,
  segments,
  isStreaming,
  compact,
  preferLlmUi,
  provider,
  onOpenTerminal,
  onEditMessage,
  editComposer,
  onOpenPath,
  onOpenDiff,
}: MessageProps) {
  const isUser = role === 'user'

  const { userDisplayText, userDisplaySegments } = useMemo(() => {
    if (!isUser) {
      return {
        userDisplayText: content,
        userDisplaySegments: [] as UserMessageSegment[],
      }
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
  const [isEditing, setIsEditing] = useState(false)
  const [showEditComposer, setShowEditComposer] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [editSegments, setEditSegments] = useState<UserMessageSegment[]>([])
  const [optimisticUserDisplayText, setOptimisticUserDisplayText] = useState<string | null>(null)
  const [optimisticUserDisplaySegments, setOptimisticUserDisplaySegments] = useState<UserMessageSegment[] | null>(null)
  const userImageAttachments = useMemo(() => {
    if (!isUser) return []
    const fromSegments = normalizeUserMessageSegments(optimisticUserDisplaySegments ?? userDisplaySegments)
      .flatMap((segment) => (
        segment.type === 'image'
          ? [{
              name: segment.name,
              mimeType: segment.mimeType,
              data: segment.data,
              preview: `data:${segment.mimeType};base64,${segment.data}`,
            }]
          : []
      ))
    return fromSegments.length > 0 ? fromSegments : (attachmentsProp ?? [])
  }, [attachmentsProp, isUser, optimisticUserDisplaySegments, userDisplaySegments])
  const copyTimerRef = useRef<number | null>(null)
  const userBubbleRef = useRef<HTMLDivElement | null>(null)
  const editPromptInputRef = useRef<PromptInputHandle | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isEditing) {
      setEditDraft(userDisplayText)
      setEditSegments(userDisplaySegments)
    }
  }, [isEditing, userDisplaySegments, userDisplayText])

  useEffect(() => {
    if (!optimisticUserDisplaySegments && optimisticUserDisplayText == null) return
    const matchesText = optimisticUserDisplayText === userDisplayText
    const matchesSegments = JSON.stringify(optimisticUserDisplaySegments ?? []) === JSON.stringify(userDisplaySegments)
    if (matchesText && matchesSegments) {
      setOptimisticUserDisplayText(null)
      setOptimisticUserDisplaySegments(null)
    }
  }, [optimisticUserDisplaySegments, optimisticUserDisplayText, userDisplaySegments, userDisplayText])

  useEffect(() => {
    if (!isEditing) {
      setShowEditComposer(false)
      return
    }
    const frameId = window.requestAnimationFrame(() => {
      setShowEditComposer(true)
    })
    editPromptInputRef.current?.focus()
    return () => window.cancelAnimationFrame(frameId)
  }, [isEditing])

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
        const duration =
          call.completedAt && call.startedAt
            ? `${((call.completedAt - call.startedAt) / 1000).toFixed(1)}s`
            : ''

        parts.push(`[${status} ${label}] ${summary}`)
        if (call.result?.message) {
          const msg =
            call.result.message.length > 500
              ? call.result.message.slice(0, 500) + '\u2026'
              : call.result.message
          parts.push(msg)
        }
        if (duration) parts.push(`Duration: ${duration}`)
        parts.push('')
      }
    }

    if (content) {
      parts.push(
        isUser ? serializeUserMessageSegmentsToMarkdown(userDisplaySegments) || userDisplayText : content,
      )
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
  const showStreamingIndicator = isStreaming && !thinking && !content.trim()
  const canCopyMessage = isUser || !isStreaming

  const startEditing = useCallback(() => {
    if (!canEdit || isSavingEdit) return
    setEditDraft(userDisplayText)
    setEditSegments(userDisplaySegments)
    setIsEditing(true)
  }, [canEdit, isSavingEdit, userDisplaySegments, userDisplayText])

  const cancelEditing = useCallback(() => {
    setEditDraft(userDisplayText)
    setEditSegments(userDisplaySegments)
    setIsEditing(false)
  }, [userDisplaySegments, userDisplayText])

  const handleUserBubbleClick = () => {
    if (!canEdit || isEditing) return
    const selection = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : ''
    if (selection) return
    startEditing()
  }

  const saveEditedMessage = useCallback(async (nextText?: string, nextSegments?: UserMessageSegment[]) => {
    if (!canEdit || !messageId || !onEditMessage || isSavingEdit) return
    const submission = createUserMessageEditSubmission(nextText ?? editDraft, nextSegments ?? editSegments)
    if (!submission) return
    if (isUserMessageEditUnchanged(submission.text, userDisplayText, userDisplaySegments)) {
      setIsEditing(false)
      return
    }

    setOptimisticUserDisplayText(submission.text)
    setOptimisticUserDisplaySegments(submission.displaySegments)
    setIsEditing(false)
    setIsSavingEdit(true)
    try {
      await onEditMessage(messageId, submission.text, messageIndex, messageFromEnd, {
        referencedFiles: submission.referencedFiles,
        displaySegments: submission.displaySegments,
      })
    } catch (error) {
      setOptimisticUserDisplayText(null)
      setOptimisticUserDisplaySegments(null)
      setIsEditing(true)
      throw error
    } finally {
      setIsSavingEdit(false)
    }
  }, [
    canEdit,
    editDraft,
    editSegments,
    isSavingEdit,
    messageId,
    messageFromEnd,
    messageIndex,
    onEditMessage,
    userDisplaySegments,
    userDisplayText,
  ])

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
    if (isEditing || !canCopyMessage || !content) return null
    return (
      <div
        className={cn(
          'absolute z-10 rounded-full border border-border/70 bg-background p-1',
          outsideBubble ? 'right-0 top-full mt-0.5' : 'bottom-1.5 right-1.5',
          'opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100',
          copied && 'opacity-100',
        )}
      >
        <MessageActions>
          {canEdit ? (
            <MessageAction
              onClick={startEditing}
              aria-label="Edit message"
              tooltip="Edit message"
              className="h-6 w-6"
            >
              <Pencil className="h-3.5 w-3.5" />
            </MessageAction>
          ) : null}
          {canRetry ? (
            <MessageAction
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                void handleRetryFromHere()
              }}
              disabled={isRetrying}
              aria-label="Retry from this message"
              tooltip="Retry from this message"
              className="h-6 w-6"
            >
              <RotateCcw className={cn('h-3.5 w-3.5', isRetrying && 'animate-spin')} />
            </MessageAction>
          ) : null}
          <MessageAction
            onClick={copyToClipboard}
            aria-label={copied ? 'Copied' : 'Copy message'}
            tooltip={copied ? 'Copied' : 'Copy message'}
            className="h-6 w-6"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </MessageAction>
        </MessageActions>
      </div>
    )
  }

  const assistantActions = !isUser ? renderActions() : null

  return (
    <AIMessage from={role} className={cn(compact ? 'py-2' : 'py-4')}>
      <div className={cn('min-w-0 max-w-[85%] space-y-2', isUser && 'order-1')}>
        {!isUser && thinking && (
          <Reasoning
            content={thinking}
            isStreaming={!!isStreaming && !content}
            duration={thinkingDuration}
          />
        )}

        {!isUser && segments && segments.length > 0 ? (
          <div className="relative min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
            {(() => {
              return segments.map((seg, i) => {
                if (seg.type === 'toolGroup') {
                  const calls = (toolCalls ?? []).filter((tc) => seg.callIds.includes(tc.callId))
                  // Collapse completed tool groups that are followed by text
                  const followedByText = segments!.slice(i + 1).some(s => s.type === 'text' && s.content.trim())
                  return calls.length > 0 ? (
                    shouldUseAgentToolCallWrapper(provider, calls) ? (
                      <AgentToolCallWrapper
                        key={`tg-${i}`}
                        provider={provider}
                        calls={calls}
                        isStreaming={!!isStreaming && i === segments.length - 1}
                        onOpenTerminal={onOpenTerminal}
                        onOpenDiff={onOpenDiff}
                      />
                    ) : (
                      <ToolCallGroup
                        key={`tg-${i}`}
                        calls={calls}
                        collapsible={followedByText}
                        onOpenTerminal={onOpenTerminal}
                        onOpenDiff={onOpenDiff}
                      />
                    )
                  ) : null
                }

                return seg.content.trim() ? (
                  <AIMessageContent
                    key={`ts-${i}`}
                    data-message-from="assistant"
                    className="max-w-full bg-card/78"
                  >
                    <AssistantMarkdown
                      content={seg.content}
                      compact={compact}
                      isStreaming={!!isStreaming && i === segments.length - 1}
                      preferLlmUi={preferLlmUi}
                      onOpenPath={onOpenPath}
                    />
                  </AIMessageContent>
                ) : null
              })
            })()}

            {isStreaming && !content && !segments.some((s) => s.type === 'text' && s.content.trim()) && (
              <div className="flex items-center gap-3 px-1 py-1 text-sm text-muted-foreground">
                <ThinkingDots />
              </div>
            )}

            {assistantActions}
          </div>
        ) : (
          <>
            {toolCalls && toolCalls.length > 0 && (
              shouldUseAgentToolCallWrapper(provider, toolCalls) ? (
                <AgentToolCallWrapper
                  provider={provider}
                  calls={toolCalls}
                  isStreaming={isStreaming}
                  onOpenTerminal={onOpenTerminal}
                  onOpenDiff={onOpenDiff}
                />
              ) : (
                <ToolCallGroup
                  calls={toolCalls}
                  collapsible={provider !== 'jait'}
                  onOpenTerminal={onOpenTerminal}
                  onOpenDiff={onOpenDiff}
                />
              )
            )}

            {content ? (
              isUser ? (
                isEditing ? (
                  <div className="w-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
                    <div
                      className={cn(
                        'space-y-3 origin-bottom transition-all duration-150 ease-out',
                        showEditComposer ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
                      )}
                    >
                        <PromptInput
                          key={`edit-${messageId ?? 'user-message'}`}
                          ref={editPromptInputRef}
                          draftStateKey={`edit:${messageId ?? 'user-message'}`}
                          value={editDraft}
                          segments={editSegments}
                          onChange={(nextValue) => {
                            setEditDraft(nextValue)
                            setEditSegments(editPromptInputRef.current?.getSegments() ?? [])
                          }}
                          onSubmit={(_chipFiles, _attachments, nextSegments) => {
                            const freshSegments = nextSegments ?? []
                            const freshText = userMessageTextFromSegments(freshSegments) || editDraft
                            setEditSegments(freshSegments)
                            void saveEditedMessage(freshText, freshSegments)
                          }}
                          disabled={isSavingEdit}
                          controlsDisabled={isSavingEdit}
                          placeholder="Edit message..."
                          onVoiceInput={editComposer?.onVoiceInput}
                          voiceRecording={editComposer?.voiceRecording}
                          voiceLevels={editComposer?.voiceLevels}
                          voiceTranscribing={editComposer?.voiceTranscribing}
                          onVoiceStop={editComposer?.onVoiceStop}
                          mode={editComposer?.mode}
                          onModeChange={editComposer?.onModeChange}
                          sendTarget={editComposer?.sendTarget}
                          onSendTargetChange={editComposer?.onSendTargetChange}
                          provider={editComposer?.provider}
                          onProviderChange={editComposer?.onProviderChange}
                          providerRuntimeMode={editComposer?.providerRuntimeMode}
                          onProviderRuntimeModeChange={editComposer?.onProviderRuntimeModeChange}
                          cliModel={editComposer?.cliModel}
                          onCliModelChange={editComposer?.onCliModelChange}
                          repoRuntime={editComposer?.repoRuntime}
                          onMoveToGateway={editComposer?.onMoveToGateway}
                          footerLeadingContent={editComposer?.footerLeadingContent}
                          sessionInfo={editComposer?.sessionInfo}
                          workspaceNodeId={editComposer?.workspaceNodeId}
                          availableFiles={editComposer?.availableFiles ?? userReferencedFilesFromSegments(userDisplaySegments)}
                          onSearchFiles={editComposer?.onSearchFiles}
                          workspaceOpen={editComposer?.workspaceOpen ?? userReferencedFilesFromSegments(userDisplaySegments).length > 0}
                          footerTrailingContent={(
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 rounded-lg"
                              onClick={cancelEditing}
                              disabled={isSavingEdit}
                              aria-label="Cancel editing message"
                              title="Cancel editing"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          className="rounded-lg border-primary/20 bg-primary/[0.08] dark:!bg-primary/[0.08] shadow-none [&_.text-muted-foreground]:text-muted-foreground [&>div]:!bg-transparent [&_[contenteditable='true']]:!bg-transparent"
                        />
                    </div>
                  </div>
                ) : (
                  <div className="relative w-fit max-w-full">
                    <AIMessageContent
                      ref={userBubbleRef}
                      data-message-from="user"
                      className={cn(
                        'min-w-0 rounded-lg bg-muted px-4 py-3 break-words [overflow-wrap:anywhere]',
                        canEdit && !isEditing && 'cursor-text transition-colors hover:bg-muted/80',
                        compact ? 'text-sm leading-normal' : 'text-base leading-relaxed',
                      )}
                      onClick={handleUserBubbleClick}
                      title={canEdit && !isEditing ? 'Click to edit message' : undefined}
                    >
                      <div className="min-w-0 space-y-3">
                        <div className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                          {(optimisticUserDisplaySegments ?? userDisplaySegments).length > 0
                            ? (optimisticUserDisplaySegments ?? userDisplaySegments).map((segment, index) =>
                                segment.type === 'text' ? (
                                  <span key={`text-${index}`}>{segment.text}</span>
                                ) : segment.type === 'file' ? (
                                  <span
                                    key={`${segment.path}-${index}`}
                                    className="mx-[2px] inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/45 px-2 py-1 text-[12px] font-medium leading-none text-foreground align-middle select-none"
                                    title={segment.path}
                                  >
                                    <FileIcon filename={segment.name} className="h-3.5 w-3.5 shrink-0" />
                                    <span className="max-w-[180px] truncate">{segment.name}</span>
                                  </span>
                                ) : null,
                              )
                            : (optimisticUserDisplayText ?? userDisplayText)}
                        </div>
                        {userImageAttachments.length > 0 && (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {userImageAttachments.map((attachment, index) => {
                              const src = attachment.preview ?? `data:${attachment.mimeType};base64,${attachment.data}`
                              return (
                                <a
                                  key={`${attachment.name}-${index}`}
                                  href={src}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block overflow-hidden rounded-lg border border-primary/10 bg-background/65"
                                >
                                  <img src={src} alt={attachment.name} className="max-h-72 w-full object-cover" />
                                  <div className="truncate border-t border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
                                    {attachment.name}
                                  </div>
                                </a>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </AIMessageContent>

                    {renderActions()}
                  </div>
                )
              ) : (
                <div className="relative min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                  <AIMessageContent
                    data-message-from="assistant"
                    className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]"
                  >
                    <AssistantMarkdown
                      content={content}
                      compact={compact}
                      isStreaming={isStreaming}
                      preferLlmUi={preferLlmUi}
                      onOpenPath={onOpenPath}
                    />
                  </AIMessageContent>
                  {assistantActions}
                </div>
              )
            ) : showStreamingIndicator ? (
              <div className="flex items-center gap-3 px-1 py-1 text-sm text-muted-foreground">
                <ThinkingDots />
              </div>
            ) : null}
          </>
        )}
      </div>
    </AIMessage>
  )
}

export const Message = memo(MessageInner)
Message.displayName = 'Message'
