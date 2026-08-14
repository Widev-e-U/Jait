import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AssistantMarkdown } from '@/components/chat/assistant-markdown'
import { MessageContent as AIMessageContent } from '@/components/ai-elements/message'
import { Reasoning } from '@/components/chat/reasoning'
import { AgentToolCallWrapper, ToolCallGroup, computeAgentNesting, type ToolCallInfo } from '@/components/chat/tool-call-card'
import type { ProviderId } from '@/lib/agents-api'
import type { MessageSegment } from '@/hooks/useChat'

/**
 * Assistant messages that are built from a live stream only collapse their
 * tool calls into a wrapper when there are several agent-style tool calls.
 */
const MIN_AGENT_TOOL_CALLS_FOR_WRAPPER = 3

/**
 * Number of top-level tool calls in a message, ignoring calls that are children
 * of a sub-agent call. This keeps a single sub-agent (which internally may make
 * many tool calls) from being mistaken for multiple sibling agent-style calls.
 */
function countTopLevelToolCalls(calls: ToolCallInfo[]): number {
  if (calls.length === 0) return 0
  const { parentSet } = computeAgentNesting(calls)
  return calls.length - parentSet.size
}

export function shouldUseAgentToolCallWrapper(provider: ProviderId | undefined, calls: ToolCallInfo[]): provider is ProviderId {
  return Boolean(provider && countTopLevelToolCalls(calls) >= MIN_AGENT_TOOL_CALLS_FOR_WRAPPER)
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
  /**
   * When true, non-steering segments are capped at 85% width (left-aligned)
   * so a steered bubble can render full-width and flush to the right edge
   * like a user message. Off by default so nested/sub-agent rendering is
   * unaffected.
   */
  capNonSteeringWidth?: boolean
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
  capNonSteeringWidth,
  className,
}: AssistantBodyProps) {
  const hasText = segments.some((s) => s.type === 'text' && typeof s.content === 'string' && s.content.trim())

  return (
    <div className={cn('relative min-w-0 max-w-full select-text break-words [overflow-wrap:anywhere]', className)}>
      {segments.map((seg, i) => {
        let node: ReactNode | null = null

        if (seg.type === 'toolGroup') {
          const callIds = Array.isArray(seg.callIds) ? seg.callIds : []
          const calls = (toolCalls ?? []).filter((tc) => callIds.includes(tc.callId))
          // Collapse completed tool groups that are followed by text
          const followedByText = segments.slice(i + 1).some(s => s.type === 'text' && typeof s.content === 'string' && s.content.trim())
          node = calls.length > 0 ? (
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
        } else if (seg.type === 'thinking') {
          node = seg.content.trim() ? (
            <Reasoning
              key={`th-${i}`}
              content={seg.content}
              isStreaming={!!isStreaming && i === segments.length - 1}
              duration={thinkingDuration}
              onOpenPath={onOpenPath}
            />
          ) : null
        } else if (seg.type === 'error') {
          node = (
            <div key={`err-${i}`} className="flex items-start gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{seg.content}</span>
            </div>
          )
        } else if (seg.type === 'steering') {
          node = (
            <div key={`sg-${i}`} className="relative ml-auto flex w-full max-w-full flex-col items-end">
              <span className="mb-1 inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-primary/70">
                <ArrowRight className="h-3 w-3" />
                Steered into running turn
              </span>
              <div className="min-w-0 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
                {seg.displayContent ?? seg.content}
              </div>
            </div>
          )
        } else {
          node = (typeof seg.content === 'string' && seg.content.trim()) ? (
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
        }

        if (node === null) return null

        // Cap only the assistant side so steered bubbles can sit flush right.
        if (capNonSteeringWidth && seg.type !== 'steering') {
          return (
            <div key={`cap-${i}`} className="max-w-[85%]">{node}</div>
          )
        }

        return node
      })}

      {isStreaming && !hasStreamingText && !hasText && (
        <div className="flex items-center gap-3 px-1 py-1 text-sm text-muted-foreground">
          <ThinkingDots />
        </div>
      )}
    </div>
  )
}
