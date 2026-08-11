import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  applyResumeSnapshotSeq,
  buildReasoningEffortRequestField,
  formatChatHttpError,
  getVisibleChangedFiles,
  isResumeStreamRunCurrent,
  shouldFlushStreamTextImmediately,
  shouldProcessResumeStreamEvent,
  shouldOpenResumeStream,
  shouldOwnDirectChatStream,
  shouldProcessDirectStreamEvent,
  shouldForceMessageLifecycleRefresh,
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

describe('buildReasoningEffortRequestField', () => {
  it('preserves explicit selections and explicit default while omitting absent values', () => {
    expect(buildReasoningEffortRequestField('high')).toEqual({ reasoningEffort: 'high' })
    expect(buildReasoningEffortRequestField(null)).toEqual({ reasoningEffort: null })
    expect(buildReasoningEffortRequestField(undefined)).toEqual({})
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

  it('refreshes a stable cached chat when a mobile browser wakes', () => {
    expect(shouldResumeChatSession({
      sessionId: 'session-1',
      isLoading: false,
      isLoadingHistory: false,
      messageCount: 2,
      forceRefresh: true,
    })).toBe(true)
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
  it('shows Continue when the gateway reports an interrupted exit', () => {
    expect(shouldShowContinueAfterDone({ hit_max_rounds: true })).toBe(true)
    expect(shouldShowContinueAfterDone({ has_timed_out_tools: true })).toBe(true)
    expect(shouldShowContinueAfterDone({ hit_max_rounds: false, has_timed_out_tools: false })).toBe(false)
    expect(shouldShowContinueAfterDone({})).toBe(false)
  })
})

describe('shouldFlushStreamTextImmediately', () => {
  it('flushes every assistant text and thinking delta immediately', () => {
    expect(shouldFlushStreamTextImmediately('token')).toBe(true)
    expect(shouldFlushStreamTextImmediately('thinking')).toBe(true)
    expect(shouldFlushStreamTextImmediately('tool_output')).toBe(false)
  })

  it('still flushes mode notices immediately', () => {
    expect(shouldFlushStreamTextImmediately('mode_notice')).toBe(true)
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

describe('applyResumeSnapshotSeq', () => {
  it('resets a stale high baseline so a newer turn\'s lower-seq events are accepted', () => {
    // The gateway resets its per-session seq counter to 0 when a new turn
    // (e.g. a hidden background-command notification) starts. The client had
    // last seen seq 42 from the previous turn.
    const seen = new Map<string, number>([['session-1', 42]])

    applyResumeSnapshotSeq(seen, 'session-1', 0)

    // The new turn's live events must now pass the dedup gate.
    expect(shouldProcessResumeStreamEvent(seen, 'session-1', { seq: 1 })).toBe(true)
    expect(shouldProcessResumeStreamEvent(seen, 'session-1', { seq: 2 })).toBe(true)
  })

  it('ignores a non-numeric snapshot seq', () => {
    const seen = new Map<string, number>([['session-1', 7]])

    applyResumeSnapshotSeq(seen, 'session-1', undefined)

    expect(seen.get('session-1')).toBe(7)
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

  it('restarts a stale resume stream when a mobile browser wakes', () => {
    expect(shouldOpenResumeStream({
      sessionId: 'session-1',
      activeResumeSessionId: 'session-1',
      hasActiveResumeStream: true,
      directStreamSessionId: null,
      hasActiveDirectStream: false,
      forceRestart: true,
    })).toBe(true)
  })

  it('does not open a resume stream while the direct chat stream owns the session', () => {
    expect(shouldOpenResumeStream({
      sessionId: 'session-1',
      activeResumeSessionId: null,
      hasActiveResumeStream: false,
      directStreamSessionId: 'session-1',
      hasActiveDirectStream: true,
      forceRestart: true,
    })).toBe(false)
  })

  it('blocks the session-switch path from attaching a second consumer mid-run', () => {
    // Re-entering a chat while this tab's own POST stream is still running. That
    // stream is only aborted by stop/restart, never by a session switch, so
    // opening a resume stream here means two consumers append tokens into the
    // same turn — duplicated/interleaved text on screen that isn't in the
    // gateway's persisted copy, so it vanishes on the next load.
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

describe('shouldForceMessageLifecycleRefresh', () => {
  it('forces reconciliation for both stream start and completion signals', () => {
    expect(shouldForceMessageLifecycleRefresh('started')).toBe(true)
    expect(shouldForceMessageLifecycleRefresh('complete')).toBe(true)
  })
})

describe('isResumeStreamRunCurrent', () => {
  it('invalidates buffered resume events as soon as the stream is aborted', () => {
    expect(isResumeStreamRunCurrent({
      cancelled: false,
      aborted: true,
      currentRunId: 7,
      runId: 7,
    })).toBe(false)
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

describe('shouldProcessDirectStreamEvent', () => {
  it('guards the production direct-stream loop before event dispatch', () => {
    const source = readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')
    const directStreamStart = source.indexOf('const response = await fetch(`${API_URL}/api/chat`')
    const directStreamEnd = source.indexOf("data.type === 'done'", directStreamStart)
    const directStreamBlock = source.slice(directStreamStart, directStreamEnd)

    expect(directStreamBlock).toContain(
      'if (!shouldProcessDirectStreamEvent(data.type, !isStale())) continue',
    )
  })

  it('keeps session-scoped events inside the chat that owns the stream', () => {
    expect(shouldProcessDirectStreamEvent('todo_list', true)).toBe(true)
    expect(shouldProcessDirectStreamEvent('plan_complete', true)).toBe(true)

    expect(shouldProcessDirectStreamEvent('todo_list', false)).toBe(false)
    expect(shouldProcessDirectStreamEvent('plan_complete', false)).toBe(false)
    expect(shouldProcessDirectStreamEvent('context_usage', false)).toBe(false)
    expect(shouldProcessDirectStreamEvent('session_info', false)).toBe(false)
    expect(shouldProcessDirectStreamEvent('file_changed', false)).toBe(false)
  })

  it('still lets stale streams finish their own lifecycle', () => {
    expect(shouldProcessDirectStreamEvent('done', false)).toBe(true)
    expect(shouldProcessDirectStreamEvent('queued', false)).toBe(true)
    expect(shouldProcessDirectStreamEvent('error', false)).toBe(true)
  })
})
