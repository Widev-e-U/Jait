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

describe('aggregateSessionMetrics — edge cases', () => {
  it('sums tokens and duration across ALL rounds of ALL assistant messages', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({
        content: 'first',
        contextFlow: {
          rounds: [
            { metrics: { durationMs: 1000, promptTokens: 50, completionTokens: 100 } },
            { metrics: { durationMs: 2000, promptTokens: 30, completionTokens: 40 } },
          ],
        },
      }),
      assistantMessage({
        content: 'second',
        contextFlow: {
          rounds: [
            { metrics: { durationMs: 500, promptTokens: 20, completionTokens: 10 } },
            { metrics: { durationMs: 1500, promptTokens: 40, completionTokens: 60 } },
          ],
        },
      }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    // prompt = 50+30+20+40 = 140
    expect(metrics.promptTokens).toBe(140)
    // completion = 100+40+10+60 = 210
    expect(metrics.completionTokens).toBe(210)
    // duration = 1000+2000+500+1500 = 5000
    expect(metrics.totalDurationMs).toBe(5000)
    // weighted speed = 210 / (5000/1000) = 42
    expect(metrics.tokensPerSecond).toBe(42)
    expect(metrics.assistantTurns).toBe(2)
    expect(metrics.textWritten).toBe(11)
  })

  it('does not let a completionTokens round with durationMs 0 poison the speed divisor', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({
        content: 'ok',
        contextFlow: {
          rounds: [
            // has completion tokens but no duration -> must not enter the speed numerator
            { metrics: { durationMs: 0, promptTokens: 5, completionTokens: 50 } },
            // usable round
            { metrics: { durationMs: 2000, promptTokens: 10, completionTokens: 100 } },
          ],
        },
      }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.completionTokens).toBe(150)
    expect(metrics.totalDurationMs).toBe(2000)
    // speed only from usable round: 100 / (2000/1000) = 50 (NOT 150/2 = 75)
    expect(metrics.tokensPerSecond).toBe(50)
  })

  it('returns null tokensPerSecond when rounds only have tokens-without-duration or duration-without-tokens', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({
        content: 'partial',
        contextFlow: {
          rounds: [
            { metrics: { durationMs: 0, completionTokens: 100 } }, // tokens, no usable duration
            { metrics: { durationMs: 5000 } },                     // duration, no tokens
          ],
        },
      }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.completionTokens).toBe(100)
    expect(metrics.totalDurationMs).toBe(5000)
    expect(metrics.tokensPerSecond).toBeNull()
  })

  it('does not produce Infinity/NaN when durationMs exists but completionTokens is 0', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({
        content: 'hi',
        contextFlow: {
          rounds: [{ metrics: { durationMs: 3000, promptTokens: 20, completionTokens: 0 } }],
        },
      }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.completionTokens).toBe(0)
    expect(metrics.totalDurationMs).toBe(3000)
    expect(metrics.tokensPerSecond).toBeNull()
    expect(Number.isFinite(metrics.tokensPerSecond as unknown as number)).toBe(false)
  })

  it('handles contextFlow undefined, null, and empty rounds', () => {
    const messages = [
      assistantMessage({ content: 'hi' }),                         // no contextFlow
      assistantMessage({ content: 'yo', contextFlow: null as unknown as { rounds?: unknown[] } }), // null
      assistantMessage({ content: 'hey', contextFlow: { rounds: [] } }), // empty rounds
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.assistantTurns).toBe(3)
    expect(metrics.textWritten).toBe(2 + 2 + 3)
    expect(metrics.completionTokens).toBe(0)
    expect(metrics.promptTokens).toBe(0)
    expect(metrics.totalDurationMs).toBe(0)
    expect(metrics.tokensPerSecond).toBeNull()
  })

  it('keeps textWritten at 0 (never NaN) for assistant messages with empty/undefined content', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({ content: '', thinking: '' }),
      assistantMessage({ content: undefined, thinking: undefined }),
      assistantMessage({ content: '' }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.textWritten).toBe(0)
    expect(Number.isNaN(metrics.textWritten)).toBe(false)
    expect(metrics.assistantTurns).toBe(0)
  })

  it('excludes user messages from assistantTurns and textWritten (and their content)', () => {
    const messages: SessionMetricsMessage[] = [
      userMessage('a very long user message that must not count as text written'),
      assistantMessage({ content: 'abc' }),
      userMessage('another user message'),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.assistantTurns).toBe(1)
    expect(metrics.textWritten).toBe(3)
  })

  it('aggregates very large token/char counts without precision loss or overflow', () => {
    const messages: SessionMetricsMessage[] = [
      assistantMessage({
        content: 'x'.repeat(5_000_000), // 5,000,000 chars
        contextFlow: {
          rounds: [
            { metrics: { durationMs: 120000, promptTokens: 2_000_000, completionTokens: 50_000_000 } },
            { metrics: { durationMs: 60000, promptTokens: 1_000_000, completionTokens: 25_000_000 } },
          ],
        },
      }),
    ]
    const metrics = aggregateSessionMetrics(messages)
    expect(metrics.completionTokens).toBe(75_000_000)
    expect(metrics.promptTokens).toBe(3_000_000)
    expect(metrics.totalDurationMs).toBe(180000)
    expect(metrics.textWritten).toBe(5_000_000)
    // 75_000_000 / (180000/1000) = 416666.666...
    expect(metrics.tokensPerSecond!).toBeCloseTo(416666.67, 0)
    expect(Number.isFinite(metrics.completionTokens)).toBe(true)
    expect(Number.isFinite(metrics.textWritten)).toBe(true)
  })
})
