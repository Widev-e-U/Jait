import type { LlmContextFlowRound } from '@/hooks/useChat'

/**
 * Loosely-typed view of a chat message we need for aggregating session
 * metrics. Kept decoupled from the full `ChatMessage` type so this module
 * stays a pure, dependency-light utility.
 */
export interface SessionMetricsMessage {
  role?: string
  content?: string
  thinking?: string
  contextFlow?: {
    rounds?: LlmContextFlowRound[]
  }
}

export interface SessionMetrics {
  /** Sum of completion (generated) tokens across all assistant rounds. */
  completionTokens: number
  /** Sum of prompt (input) tokens across all assistant rounds. */
  promptTokens: number
  /** Sum of per-round durations (ms) for rounds that report a positive duration. */
  totalDurationMs: number
  /**
   * Weighted average of completion tokens / wall-clock seconds across rounds
   * that have both a positive duration and completion token count. Falls back
   * to the arithmetic mean of each round's reported `tokensPerSecond`. `null`
   * when there is no usable timing data.
   */
  tokensPerSecond: number | null
  /** Total characters written (content + thinking) across assistant messages. */
  textWritten: number
  /** Number of assistant messages that produced metrics/response content. */
  assistantTurns: number
  /** True when any included provider supplied estimated rather than reported token counts. */
  tokenUsageEstimated: boolean
}

/**
 * Aggregates already-persisted per-message metrics and message content into
 * lightweight session-level performance figures. This is a pure, synchronous
 * read over data that was computed server-side once a turn finished — it does
 * not touch the stream or the network, so calling it has no performance cost.
 */
export function aggregateSessionMetrics(messages: SessionMetricsMessage[] | undefined): SessionMetrics {
  let completionTokens = 0
  let promptTokens = 0
  let totalDurationMs = 0
  let textWritten = 0
  let assistantTurns = 0
  let tokenUsageEstimated = false

  // Weighted-average inputs derived from rounds that have both completion
  // tokens and a positive duration (completion tokens / seconds).
  let speedCompletionTokens = 0
  let speedDurationMs = 0
  let hasUsableTiming = false
  // Fallback: rounds that only report a `tokensPerSecond` value directly.
  const fallbackTokSec: number[] = []

  for (const msg of messages ?? []) {
    const isAssistant = msg.role === 'assistant'
    if (isAssistant && (msg.content || msg.thinking)) {
      assistantTurns++
      textWritten += (msg.content?.length ?? 0) + (msg.thinking?.length ?? 0)
    }

    const rounds = msg.contextFlow?.rounds
    if (!rounds) continue

    for (const round of rounds) {
      const m = round.metrics
      if (!m) continue
      if (m.tokenUsageEstimated) tokenUsageEstimated = true

      if (m.durationMs > 0) {
        totalDurationMs += m.durationMs
      }
      if (m.promptTokens && m.promptTokens > 0) {
        promptTokens += m.promptTokens
      }
      if (m.completionTokens && m.completionTokens > 0) {
        completionTokens += m.completionTokens
      }

      if (m.durationMs > 0 && m.completionTokens && m.completionTokens > 0) {
        // completion tokens per second, weighted by completion token count
        speedCompletionTokens += m.completionTokens
        speedDurationMs += m.durationMs
        hasUsableTiming = true
      } else if (m.tokensPerSecond && m.tokensPerSecond > 0) {
        fallbackTokSec.push(m.tokensPerSecond)
      }
    }
  }

  let tokensPerSecond: number | null = null
  if (hasUsableTiming && speedDurationMs > 0 && speedCompletionTokens > 0) {
    tokensPerSecond = (speedCompletionTokens / (speedDurationMs / 1000))
  } else if (fallbackTokSec.length > 0) {
    tokensPerSecond = fallbackTokSec.reduce((a, b) => a + b, 0) / fallbackTokSec.length
  }

  return {
    completionTokens,
    promptTokens,
    totalDurationMs,
    tokensPerSecond,
    textWritten,
    assistantTurns,
    tokenUsageEstimated,
  }
}
