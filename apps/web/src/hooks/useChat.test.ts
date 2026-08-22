import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  applyResumeSnapshotSeq,
  buildReasoningEffortRequestField,
  formatChatHttpError,
  getResumeReconnectDelay,
  getVisibleChangedFiles,
  isRetryableResumeResponseStatus,
  isResumeStreamRunCurrent,
  shouldFlushStreamTextImmediately,
  shouldProcessResumeStreamEvent,
  shouldOpenResumeStream,
  shouldOwnDirectChatStream,
  shouldProcessDirectStreamEvent,
  segmentsWithError,
  shouldForceMessageLifecycleRefresh,
  shouldResumeChatSession,
  shouldShowContinueAfterDone,
} from '@/hooks/useChat'
import type { MessageStreamSnapshot } from '@/lib/message-stream'

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

describe('resume stream recovery policy', () => {
  it('uses jittered exponential backoff capped at 30 seconds', () => {
    expect(getResumeReconnectDelay(1, () => 0)).toBe(250)
    expect(getResumeReconnectDelay(1, () => 1)).toBe(500)
    expect(getResumeReconnectDelay(2, () => 0)).toBe(500)
    expect(getResumeReconnectDelay(2, () => 1)).toBe(1_000)
    expect(getResumeReconnectDelay(20, () => 0)).toBe(15_000)
    expect(getResumeReconnectDelay(20, () => 1)).toBe(30_000)
  })

  it('retries temporary HTTP failures but not terminal client responses', () => {
    expect(isRetryableResumeResponseStatus(408)).toBe(true)
    expect(isRetryableResumeResponseStatus(425)).toBe(true)
    expect(isRetryableResumeResponseStatus(429)).toBe(true)
    expect(isRetryableResumeResponseStatus(503)).toBe(true)
    expect(isRetryableResumeResponseStatus(400)).toBe(false)
    expect(isRetryableResumeResponseStatus(401)).toBe(false)
    expect(isRetryableResumeResponseStatus(404)).toBe(false)
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

describe('segmentsWithError', () => {
  const snapshot = (overrides: Partial<MessageStreamSnapshot> = {}): MessageStreamSnapshot => ({
    content: '',
    segments: [],
    ...overrides,
  })

  it('appends the failure after the streamed segments instead of replacing them', () => {
    const result = segmentsWithError(snapshot({
      segments: [
        { type: 'text', content: 'Working on it' },
        { type: 'toolGroup', callIds: ['call_1'] },
      ],
    }), 'You exceeded your current quota')

    expect(result).toEqual([
      { type: 'text', content: 'Working on it' },
      { type: 'toolGroup', callIds: ['call_1'] },
      { type: 'error', content: 'You exceeded your current quota' },
    ])
  })

  it('wraps bare content into a text segment so the partial answer stays visible', () => {
    const result = segmentsWithError(snapshot({ content: 'Partial answer' }), 'Backend unreachable')

    expect(result).toEqual([
      { type: 'text', content: 'Partial answer' },
      { type: 'error', content: 'Backend unreachable' },
    ])
  })

  it('yields a bare error segment when the turn produced nothing before failing', () => {
    const result = segmentsWithError(snapshot(), 'You exceeded your current quota')

    expect(result).toEqual([{ type: 'error', content: 'You exceeded your current quota' }])
  })

  it('renders the error as the last segment — the red marker marks where the turn stopped', () => {
    const result = segmentsWithError(snapshot({
      segments: [{ type: 'thinking', content: 'reasoning…' }],
    }), 'Rate limit reached')

    expect(result[result.length - 1]).toEqual({ type: 'error', content: 'Rate limit reached' })
  })
})

describe('turn-ending error handling', () => {
  it('appends the gateway error to the in-flight turn instead of spawning a second bubble', () => {
    const source = readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')
    const sseErrorStart = source.indexOf("} else if (data.type === 'error') {")
    const sseErrorEnd = source.indexOf('} catch (parseErr)', sseErrorStart)
    const sseErrorBlock = source.slice(sseErrorStart, sseErrorEnd)

    // The existing turn is kept and marked with the failure at the end.
    expect(sseErrorBlock).toContain('segmentsWithError(finalSnapshot, errorMsg)')
    expect(sseErrorBlock).toContain('const hasTurn = !!assistantId && prev.messages.some(m => m.id === assistantId)')
    // No separate error bubble is appended when a turn exists.
    expect(sseErrorBlock).toContain('prev.messages.map')
  })

  it('direct-stream catch keeps the partial turn and marks where it stopped', () => {
    const source = readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')
    // The direct-stream catch is the *last* place the stream is finished — the
    // SSE handler above also calls stream.finish(), so anchor on the last one.
    const catchStart = source.lastIndexOf('const finalSnapshot = stream.finish()')
    // Anchor the end on the catch's own exit rather than a fixed length, so
    // adding branches inside the catch can't silently slide the assertion out
    // of the window and make this pass/fail for the wrong reason.
    const catchBlock = source.slice(catchStart, source.indexOf("return 'retry'", catchStart))

    expect(catchBlock).toContain('segmentsWithError(finalSnapshot, errorMessage)')
    expect(catchBlock).toContain('m.id === assistantId')
  })
})

describe('direct-stream stall recovery', () => {
  const source = () => readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')

  const directStreamBlock = () => {
    const src = source()
    const start = src.indexOf('const response = await fetch(`${API_URL}/api/chat`')
    const end = src.indexOf("} catch (error) {", start)
    return src.slice(start, end)
  }

  // ── The bug this guards against ──
  // A black-holed socket (no FIN/RST) makes `reader.read()` park forever, so the
  // direct stream never settles and `abortControllerRef` is never cleared. These
  // three assertions show that state has no exit transition: every recovery
  // entry point is refused while a direct stream is nominally active.
  it('proves a live direct stream blocks every resume path, including forceRestart', () => {
    const base = {
      sessionId: 'session-1',
      activeResumeSessionId: null,
      hasActiveResumeStream: false,
      directStreamSessionId: 'session-1',
      hasActiveDirectStream: true,
    }

    // visibilitychange / online / pageshow all call through with forceRestart.
    expect(shouldOpenResumeStream({ ...base, forceRestart: true })).toBe(false)
    // A session switch away and back.
    expect(shouldOpenResumeStream(base)).toBe(false)
    // Re-entering the same chat with a resume stream also already open.
    expect(shouldOpenResumeStream({
      ...base,
      activeResumeSessionId: 'session-1',
      hasActiveResumeStream: true,
      forceRestart: true,
    })).toBe(false)
  })

  // This gate is deliberate — two consumers appending into one turn duplicates
  // text that isn't in the gateway's persisted copy. So the fix must make the
  // dead direct stream *settle*, not race a second consumer past the gate.
  it('bounds the direct read loop so a dead socket cannot park it forever', () => {
    const block = directStreamBlock()
    expect(block).toContain('armDirectIdleTimer()')
    // Rearmed inside the loop, so a live-but-slow turn never trips it.
    const loopStart = block.indexOf('while (true) {')
    expect(block.slice(loopStart)).toContain('armDirectIdleTimer()')
  })

  it('clears the watchdog on every exit path so no timer outlives its send', () => {
    const src = source()
    const sendStart = src.indexOf('const sendMessage = useCallback(')
    // sendMessage has several `return 'sent'` exits, so close on its dependency
    // array instead of the first one.
    const sendBlock = src.slice(sendStart, src.indexOf('}, [authToken, clearUnfinishedTodoList', sendStart))
    // Declared per-send (a local, not a ref or a map keyed by session).
    expect(sendBlock).toContain('let directIdleTimer: ReturnType<typeof setTimeout> | null = null')
    // Normal completion + catch entry.
    expect(sendBlock.match(/clearDirectIdleTimer\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    // Rearming clears first, so timers are replaced rather than stacked.
    expect(sendBlock).toContain('const armDirectIdleTimer = () => {\n      clearDirectIdleTimer()')
  })

  it('treats a watchdog abort as a reconnect, not a user cancel', () => {
    const src = source()
    const catchStart = src.lastIndexOf('const finalSnapshot = stream.finish()')
    const catchBlock = src.slice(catchStart, catchStart + 2000)
    // The stalled branch must come before the cancel handling that marks running
    // tool calls as "Cancelled" and drops the placeholder.
    const stalledIdx = catchBlock.indexOf('if (directStreamStalled) {')
    const cancelIdx = catchBlock.indexOf("message: 'Cancelled'")
    expect(stalledIdx).toBeGreaterThan(-1)
    expect(stalledIdx).toBeLessThan(cancelIdx)
    // It hands off rather than tearing down the turn.
    expect(catchBlock.slice(stalledIdx, cancelIdx)).toContain('finishOwnedDirectStream()')
  })

  it('arms the handoff so finishDirectStream actually opens the resume stream', () => {
    const src = source()
    const armStart = src.indexOf('const armDirectIdleTimer = () => {')
    const armBlock = src.slice(armStart, src.indexOf('}, DIRECT_STREAM_IDLE_TIMEOUT_MS)', armStart))
    // finishDirectStream early-returns unless this flag is set, so without it the
    // watchdog would clear the ref but never re-attach.
    expect(armBlock).toContain('pendingResumeAfterDirectStreamRef.current = true')
    expect(armBlock).toContain('controller.abort()')
  })

  it('leaves headroom over the gateway keepalive so long tool runs never trip it', () => {
    const src = source()
    const match = src.match(/const DIRECT_STREAM_IDLE_TIMEOUT_MS = ([\d_]+)/)
    const timeout = Number(match![1].replace(/_/g, ''))
    // Gateway writes ": keepalive" every 15s for the whole turn.
    expect(timeout).toBeGreaterThanOrEqual(15_000 * 2)
  })
})
