import { describe, expect, it } from 'vitest'
import {
  aggregateSessionMetrics,
  type SessionMetricsMessage,
} from '@/lib/chat-session-metrics'

function assistantMessage(partial: Partial<SessionMetricsMessage>): SessionMetricsMessage {
  return { role: 'assistant', content: '', ...partial }
}

function userMessage(content = 'hello world'): SessionMetricsMessage {
  return { role: 'user', content }
}

describe('aggregateSessionMetrics', () => {
  it('returns empty metrics for no messages', () => {
    expect(aggregateSessionMetrics(undefined)).toEqual({
      completionTokens: 0,
      promptTokens: 0,
      totalDurationMs: 0,
      tokensPerSecond: null,
      textWritten: 0,
      assistantTurns: 0,
    })
    expect(aggregateSessionMetrics([])).toEqual({
      completionTokens: 0,
      promptTokens: 0,
      totalDurationMs: 0,
      tokensPerSecond: null,
      textWritten: 0,
      assistantTurns: 0,
    })
  })

  it('ignores user messages for text/turns and rounds', () => {
    const messages = [
      userMessage('not counted'),
      assistantMessage({ content: 'hi', contextFlow: { rounds: [] } }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.assistantTurns).toBe(1)
    expect(metrics.textWritten).toBe(2)
    expect(metrics.completionTokens).toBe(0)
  })

  it('sums completion and prompt tokens across all rounds', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({
        contextFlow: {
          rounds: [
            { metrics: { durationMs: 1000, promptTokens: 50, completionTokens: 100 } },
            { metrics: { durationMs: 2000, promptTokens: 30, completionTokens: 40 } },
          ],
        },
      }),
      assistantMessage({
        contextFlow: {
          rounds: [{ metrics: { durationMs: 500, promptTokens: 20, completionTokens: 10 } }],
        },
      }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.promptTokens).toBe(100)
    expect(metrics.completionTokens).toBe(150)
    expect(metrics.totalDurationMs).toBe(3500)
  })

  it('computes weighted tokens-per-second from completion tokens / duration', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({
        contextFlow: {
          rounds: [
            // 100 completion tokens over 2000ms  -> 50 tok/s
            { metrics: { durationMs: 2000, promptTokens: 10, completionTokens: 100 } },
            // 20 completion tokens over 1000ms   -> 20 tok/s
            { metrics: { durationMs: 1000, promptTokens: 10, completionTokens: 20 } },
          ],
        },
      }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    // Per spec: sum(completionTokens) / sum(durationMsInSeconds) = 120 / 3s = 40
    expect(metrics.tokensPerSecond).toBe(40)
  })

  it('falls back to the arithmetic mean of reported tokensPerSecond when no duration data exists', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({
        contextFlow: {
          rounds: [{ metrics: { durationMs: 0, promptTokens: 5, completionTokens: 10, tokensPerSecond: 60 } }],
        },
      }),
      assistantMessage({
        contextFlow: {
          rounds: [{ metrics: { durationMs: 0, promptTokens: 5, completionTokens: 10, tokensPerSecond: 20 } }],
        },
      }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.totalDurationMs).toBe(0)
    expect(metrics.tokensPerSecond).toBe(40)
  })

  it('returns null tokens-per-second when there is no usable timing data', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({
        contextFlow: {
          rounds: [{ metrics: { durationMs: 0, promptTokens: 5, completionTokens: 10 } }],
        },
      }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.tokensPerSecond).toBeNull()
    // tokens are still summed
    expect(metrics.completionTokens).toBe(10)
  })

  it('sums text written from content and thinking of assistant messages', () => {
    const messages: SessionMetricsMessage[] = [
      userMessage('not counted for text'),
      assistantMessage({ content: 'abcdef', thinking: 'xyz' }),
      assistantMessage({ content: 'hello' }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.textWritten).toBe(6 + 3 + 5)
    expect(metrics.assistantTurns).toBe(2)
  })

  it('does not count assistant turns with no content/thinking', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({
        contextFlow: {
          rounds: [{ metrics: { durationMs: 100, completionTokens: 5 } }],
        },
      }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.assistantTurns).toBe(0)
    expect(metrics.completionTokens).toBe(5)
  })
})
