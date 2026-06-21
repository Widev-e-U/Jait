import { describe, expect, it } from 'vitest'

import {
  formatChatHttpError,
  getVisibleChangedFiles,
  shouldProcessResumeStreamEvent,
  shouldOpenResumeStream,
  shouldOwnDirectChatStream,
  shouldResumeChatSession,
  shouldShowContinueAfterDone,
} from '@/hooks/useChat'

describe('formatChatHttpError', () => {
  it('explains Codex image uploads that hit the gateway body limit', () => {
    expect(formatChatHttpError(413, {
      provider: 'codex',
      attachments: [{ name: 'screen.png', mimeType: 'image/png', data: 'abc' }],
    })).toBe('Codex cannot use image uploads in Jait yet, and this image is too large for the gateway to accept. Remove the image or reference it as a project file path instead.')
  })

  it('detects oversized image data stored in display segments', () => {
    expect(formatChatHttpError(413, {
      provider: 'codex',
      displaySegments: [{ type: 'image', name: 'screen.png', mimeType: 'image/png', data: 'abc' }],
    })).toContain('Codex cannot use image uploads')
  })

  it('keeps a generic fallback for non-image HTTP failures', () => {
    expect(formatChatHttpError(500)).toBe('HTTP 500')
  })
})

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

  it('resumes when the chat is preserved behind a transient reconnect error', () => {
    expect(shouldResumeChatSession({
      sessionId: 'session-1',
      isLoading: false,
      isLoadingHistory: false,
      messageCount: 2,
      error: 'Connection interrupted. Attempting to reconnect...',
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

describe('getVisibleChangedFiles', () => {
  const changedFiles = [
    { path: '/project/app.ts', name: 'app.ts', state: 'undecided' as const },
  ]

  it('hides file review prompts while switching sessions', () => {
    expect(getVisibleChangedFiles(changedFiles, true)).toEqual([])
  })

  it('keeps file review prompts for the active hydrated session', () => {
    expect(getVisibleChangedFiles(changedFiles, false)).toBe(changedFiles)
  })
})

describe('shouldShowContinueAfterDone', () => {
  it('shows Continue only when the gateway reports max tool rounds', () => {
    expect(shouldShowContinueAfterDone({ hit_max_rounds: true })).toBe(true)
    expect(shouldShowContinueAfterDone({ hit_max_rounds: false })).toBe(false)
    expect(shouldShowContinueAfterDone({ has_timed_out_tools: true })).toBe(false)
    expect(shouldShowContinueAfterDone({})).toBe(false)
  })
})

describe('shouldProcessResumeStreamEvent', () => {
  it('drops duplicate or older sequenced resume events for the same session', () => {
    const seen = new Map<string, number>()

    expect(shouldProcessResumeStreamEvent(seen, 'session-1', { seq: 10 })).toBe(true)
    expect(shouldProcessResumeStreamEvent(seen, 'session-1', { seq: 10 })).toBe(false)
    expect(shouldProcessResumeStreamEvent(seen, 'session-1', { seq: 9 })).toBe(false)
    expect(shouldProcessResumeStreamEvent(seen, 'session-1', { seq: 11 })).toBe(true)
  })

  it('tracks sessions independently and allows unsequenced direct events', () => {
    const seen = new Map<string, number>([['session-1', 5]])

    expect(shouldProcessResumeStreamEvent(seen, 'session-2', { seq: 1 })).toBe(true)
    expect(shouldProcessResumeStreamEvent(seen, 'session-1', {})).toBe(true)
  })
})

describe('shouldOpenResumeStream', () => {
  it('does not open a duplicate resume stream for the active session', () => {
    expect(shouldOpenResumeStream({
      sessionId: 'session-1',
      activeResumeSessionId: 'session-1',
      hasActiveResumeStream: true,
      directStreamSessionId: null,
      hasActiveDirectStream: false,
    })).toBe(false)
  })

  it('does not open a resume stream while the direct chat stream owns the session', () => {
    expect(shouldOpenResumeStream({
      sessionId: 'session-1',
      activeResumeSessionId: null,
      hasActiveResumeStream: false,
      directStreamSessionId: 'session-1',
      hasActiveDirectStream: true,
    })).toBe(false)
  })

  it('allows a resume stream when there is no active owner for the session', () => {
    expect(shouldOpenResumeStream({
      sessionId: 'session-1',
      activeResumeSessionId: 'session-2',
      hasActiveResumeStream: true,
      directStreamSessionId: null,
      hasActiveDirectStream: false,
    })).toBe(true)
  })
})

describe('shouldOwnDirectChatStream', () => {
  it('does not let a concurrent submit for the same session take over the active stream', () => {
    expect(shouldOwnDirectChatStream({
      sessionId: 'session-1',
      directStreamSessionId: 'session-1',
      hasActiveDirectStream: true,
    })).toBe(false)
  })

  it('allows ownership when no direct stream is active for that session', () => {
    expect(shouldOwnDirectChatStream({
      sessionId: 'session-1',
      directStreamSessionId: 'session-2',
      hasActiveDirectStream: true,
    })).toBe(true)
    expect(shouldOwnDirectChatStream({
      sessionId: 'session-1',
      directStreamSessionId: null,
      hasActiveDirectStream: false,
    })).toBe(true)
  })
})
