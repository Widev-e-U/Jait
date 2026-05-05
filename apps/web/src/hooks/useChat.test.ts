import { describe, expect, it } from 'vitest'

import { formatChatHttpError, getVisibleChangedFiles, shouldResumeChatSession, shouldShowContinueAfterDone } from '@/hooks/useChat'

describe('formatChatHttpError', () => {
  it('explains Codex image uploads that hit the gateway body limit', () => {
    expect(formatChatHttpError(413, {
      provider: 'codex',
      attachments: [{ name: 'screen.png', mimeType: 'image/png', data: 'abc' }],
    })).toBe('Codex cannot use image uploads in Jait yet, and this image is too large for the gateway to accept. Remove the image or reference it as a workspace file path instead.')
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
    { path: '/workspace/app.ts', name: 'app.ts', state: 'undecided' as const },
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
