import { describe, expect, it } from 'vitest'

import { shouldResumeChatSession } from '@/hooks/useChat'

describe('shouldResumeChatSession', () => {
  it('resumes when a stream was active', () => {
    expect(shouldResumeChatSession({
      sessionId: 'session-1',
      isLoading: true,
      isLoadingHistory: false,
      messageCount: 3,
    })).toBe(true)
  })

  it('resumes when wake finds an unexpectedly empty chat', () => {
    expect(shouldResumeChatSession({
      sessionId: 'session-1',
      isLoading: false,
      isLoadingHistory: false,
      messageCount: 0,
    })).toBe(true)
  })

  it('does not resume while history is already loading', () => {
    expect(shouldResumeChatSession({
      sessionId: 'session-1',
      isLoading: false,
      isLoadingHistory: true,
      messageCount: 0,
    })).toBe(false)
  })

  it('does not resume a stable non-empty idle chat', () => {
    expect(shouldResumeChatSession({
      sessionId: 'session-1',
      isLoading: false,
      isLoadingHistory: false,
      messageCount: 2,
    })).toBe(false)
  })
})
