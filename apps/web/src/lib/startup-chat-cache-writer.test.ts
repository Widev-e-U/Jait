import { describe, expect, it, vi } from 'vitest'

import { createStartupChatCacheWriter } from '@/lib/startup-chat-cache-writer'

function history(content: string) {
  return {
    messages: [{ id: 'assistant', role: 'assistant' as const, content }],
    hasMore: false,
    totalMessages: 1,
    streaming: true,
  }
}

describe('createStartupChatCacheWriter', () => {
  it('writes immediately and keeps refreshing during continuous streaming updates', () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const writer = createStartupChatCacheWriter({ write })

    writer.schedule({ scope: 'scope', sessionId: 'session', history: history('first') })
    expect(write).toHaveBeenLastCalledWith('scope', 'session', history('first'))

    for (let elapsed = 100; elapsed <= 1_600; elapsed += 100) {
      vi.advanceTimersByTime(100)
      writer.schedule({ scope: 'scope', sessionId: 'session', history: history(String(elapsed)) })
    }

    expect(write.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(write).toHaveBeenLastCalledWith('scope', 'session', history('1400'))

    writer.cancel()
    vi.useRealTimers()
  })

  it('flushes the previous chat and writes a new session immediately', () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const writer = createStartupChatCacheWriter({ write })

    writer.schedule({ scope: 'scope', sessionId: 'first', history: history('initial') })
    vi.advanceTimersByTime(100)
    writer.schedule({ scope: 'scope', sessionId: 'first', history: history('latest') })
    writer.schedule({ scope: 'scope', sessionId: 'second', history: history('new') })

    expect(write.mock.calls).toEqual([
      ['scope', 'first', history('initial')],
      ['scope', 'first', history('latest')],
      ['scope', 'second', history('new')],
    ])

    writer.cancel()
    vi.useRealTimers()
  })
})
