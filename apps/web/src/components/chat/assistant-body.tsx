import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AssistantMarkdown } from '@/components/chat/assistant-markdown'
import { MessageContent as AIMessageContent } from '@/components/ai-elements/message'
import { Reasoning } from '@/components/chat/reasoning'
import { AgentToolCallWrapper, ToolCallGroup, type ToolCallInfo } from '@/components/chat/tool-call-card'
import type { ProviderId } from '@/lib/agents-api'
import type { MessageSegment } from '@/hooks/useChat'

/**
 * Assistant messages that are built from a live stream only collapse their
 * tool calls into a wrapper when there are several agent-style tool calls.
 */
const MIN_AGENT_TOOL_CALLS_FOR_WRAPPER = 3

export function shouldUseAgentToolCallWrapper(provider: ProviderId | undefined, calls: ToolCallInfo[]): provider is ProviderId {
  return Boolean(provider && calls.length >= MIN_AGENT_TOOL_CALLS_FOR_WRAPPER)
}

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

export interface AssistantBodyProps {
  /** Ordered interleaving of text, thinking, and tool-group segments. */
  segments: MessageSegment[]
  toolCalls?: ToolCallInfo[]
  isStreaming?: boolean
  /** True when the message already carries non-empty streamed text (hides the idle dots). */
  hasStreamingText?: boolean
  thinkingDuration?: number
  provider?: ProviderId
  threadControlThreads?: Record<string, unknown>[]
  onOpenTerminal?: (terminalId: string | null) => void
  onOpenDiff?: (filePath: string) => void
  renderInlineSecretPrompt?: (call: ToolCallInfo) => ReactNode
  onApprovalResponse?: (requestId: string, approved: boolean) => Promise<void> | void
  compact?: boolean
  preferLlmUi?: boolean
  onOpenPath?: (path: string, line?: number, column?: number) => Promise<void> | void
  className?: string
}

/**
 * Shared assistant "body" renderer: turns an ordered list of text / thinking /
 * tool-group segments into the same reasoning block + tool cards + markdown
 * layout used by a normal chat message. Both the top-level `Message` component
 * and nested sub-agent turns render through this, so a sub-agent's work looks
 * exactly like a normal chat instead of a bespoke card.
 */
export function AssistantBody({
  segments,
  toolCalls,
  isStreaming = false,
  hasStreamingText = false,
  thinkingDuration,
  provider,
  threadControlThreads,
  onOpenTerminal,
  onOpenDiff,
  renderInlineSecretPrompt,
  onApprovalResponse,
  compact,
  preferLlmUi,
  onOpenPath,
  className,
}: AssistantBodyProps) {
  const hasText = segments.some((s) => s.type === 'text' && typeof s.content === 'string' && s.content.trim())

  return (
    <div className={cn('relative min-w-0 max-w-full select-text break-words [overflow-wrap:anywhere]', className)}>
      {segments.map((seg, i) => {
        if (seg.type === 'toolGroup') {
          const callIds = Array.isArray(seg.callIds) ? seg.callIds : []
          const calls = (toolCalls ?? []).filter((tc) => callIds.includes(tc.callId))
          // Collapse completed tool groups that are followed by text
          const followedByText = segments.slice(i + 1).some(s => s.type === 'text' && typeof s.content === 'string' && s.content.trim())
          return calls.length > 0 ? (
            shouldUseAgentToolCallWrapper(provider, calls) ? (
              <AgentToolCallWrapper
                key={`tg-${i}`}
                provider={provider}
                calls={calls}
                isStreaming={!!isStreaming && i === segments.length - 1}
                threadControlThreads={threadControlThreads}
                onOpenTerminal={onOpenTerminal}
                onOpenDiff={onOpenDiff}
                renderInlineSecretPrompt={renderInlineSecretPrompt}
                onApprovalResponse={onApprovalResponse}
              />
            ) : (
              <ToolCallGroup
                key={`tg-${i}`}
                calls={calls}
                collapsible={followedByText}
                threadControlThreads={threadControlThreads}
                onOpenTerminal={onOpenTerminal}
                onOpenDiff={onOpenDiff}
                renderInlineSecretPrompt={renderInlineSecretPrompt}
                onApprovalResponse={onApprovalResponse}
              />
            )
          ) : null
        }

        if (seg.type === 'thinking') {
          return seg.content.trim() ? (
            <Reasoning
              key={`th-${i}`}
              content={seg.content}
              isStreaming={!!isStreaming && i === segments.length - 1}
              duration={thinkingDuration}
            />
          ) : null
        }

        if (seg.type === 'error') {
          return (
            <div key={`err-${i}`} className="flex items-start gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{seg.content}</span>
            </div>
          )
        }

        if (seg.type === 'steering') {
          return (
            <div key={`sg-${i}`} className="relative ml-auto flex w-fit max-w-full flex-col items-end">
              <span className="mb-1 inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-primary/70">
                <ArrowRight className="h-3 w-3" />
                Steered into running turn
              </span>
              <div className="min-w-0 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
                {seg.displayContent ?? seg.content}
              </div>
            </div>
          )
        }

        return (typeof seg.content === 'string' && seg.content.trim()) ? (
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
      })}

      {isStreaming && !hasStreamingText && !hasText && (
        <div className="flex items-center gap-3 px-1 py-1 text-sm text-muted-foreground">
          <ThinkingDots />
        </div>
      )}
    </div>
  )
}
