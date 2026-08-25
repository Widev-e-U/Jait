import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  buildReasoningEffortRequestField,
  formatChatHttpError,
  getVisibleChangedFiles,
  isTurnEndEvent,
  isTurnStartEvent,
  parseQueuedChatResponse,
  shouldFlushStreamTextImmediately,
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

describe('shouldForceMessageLifecycleRefresh', () => {
  it('forces reconciliation for both stream start and completion signals', () => {
    expect(shouldForceMessageLifecycleRefresh('started')).toBe(true)
    expect(shouldForceMessageLifecycleRefresh('complete')).toBe(true)
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
  const source = () => readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')

  it('appends the gateway error to the in-flight turn instead of spawning a second bubble', () => {
    const src = source()
    const errorStart = src.indexOf("} else if (data.type === 'error') {")
    const errorBlock = src.slice(errorStart, src.indexOf('interface SnapshotResponse', errorStart))

    // The existing turn is kept and marked with the failure at the end.
    expect(errorBlock).toContain('segmentsWithError(finalSnapshot, errorMsg)')
    expect(errorBlock).toContain('const hasTurn = !!finishedId && prev.messages.some(m => m.id === finishedId)')
    // No separate error bubble is appended when a turn exists.
    expect(errorBlock).toContain('prev.messages.map')
  })

  it('renders a send that never became a turn, since no error event is coming', () => {
    const src = source()
    // A POST that failed before the gateway accepted it produces nothing on the
    // subscription, so `sendMessage` itself owns the failure. If it stopped
    // rendering it, the turn would fail silently.
    const catchStart = src.indexOf('    } catch (error) {', src.indexOf('const sendMessage = useCallback(async ('))
    const catchBlock = src.slice(catchStart, src.indexOf("return 'retry'", catchStart))

    expect(catchBlock).toContain('const owned = releasePlaceholder()')
    expect(catchBlock).toContain("segments: [{ type: 'error' as const, content: errorMessage }]")
  })
})

describe('single-consumer send path', () => {
  const source = () => readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')

  const sendBlock = () => {
    const src = source()
    const start = src.indexOf('const sendMessage = useCallback(async (')
    return src.slice(start, src.indexOf('}, [authToken, onLoginRequired, resumeSessionStream, sessionId])', start))
  }

  // ── The bug this guards against ──
  // Reading the POST response *and* the session subscription meant two
  // consumers appending into the same turn: duplicated/interleaved tokens on
  // screen that aren't in the gateway's persisted copy, so they vanish on the
  // next load. All the ownership/handoff bookkeeping existed to arbitrate that.
  it('never reads the chat POST body as a second event source', () => {
    const block = sendBlock()
    expect(block).not.toContain('response.body?.getReader()')
    expect(block).not.toContain('new TextDecoder()')
    // The socket is released instead, which the gateway treats as a client
    // disconnect while it keeps producing and persisting the turn.
    expect(block).toContain('void response.body?.cancel()')
  })

  it('hands the optimistic bubble to the consumer instead of streaming into it', () => {
    const block = sendBlock()
    expect(block).toContain('pendingAssistantPlaceholderRef.current = { sessionId: requestSessionId, messageId: assistantId }')
  })

  it('still reads the 202 queued reply, which never becomes a turn', () => {
    const block = sendBlock()
    // A queued message produces no events at all, so the two-line 202 body is
    // the only place its server-assigned id exists.
    expect(block).toContain('parseQueuedChatResponse(await response.text())')
    expect(block).toContain("return 'queued'")
  })
})

describe('durable subscription lifecycle', () => {
  const source = () => readFileSync(new URL('./useChat.ts', import.meta.url), 'utf8')

  it('subscribes from the exact log position the snapshot was taken at', () => {
    const src = source()
    // Any other resume position leaves a gap (subscribing later) or replays
    // events the snapshot already contains (subscribing earlier).
    expect(src).toContain("subscribe(typeof data.seq === 'number' ? String(data.seq) : null)")
  })

  it('resets the per-turn accumulator at the turn boundary, not per connection', () => {
    const src = source()
    // The subscription outlives turns now. Without an explicit reset the next
    // turn's tokens would append to the previous turn's segment list.
    const beginTurn = src.slice(src.indexOf('const beginTurn = () => {'), src.indexOf('/** Resolve which bubble'))
    expect(beginTurn).toContain('stream = createMessageStream()')
    expect(beginTurn).toContain('assistantId = null')
    // Pending text belongs to the outgoing turn, so it must drain first.
    expect(beginTurn.indexOf('textPacer.flushNow()')).toBeLessThan(beginTurn.indexOf('stream = createMessageStream()'))
  })

  it('only adopts a snapshot assistant bubble while that turn is still running', () => {
    const src = source()
    // Adopting a *finished* answer would stream the next turn into it.
    expect(src).toContain("if (snapshotStreaming && lastMsg?.role === 'assistant') {")
  })

  it('keeps the subscription open when the user stops a turn', () => {
    const src = source()
    const cancelBlock = src.slice(src.indexOf('const cancelRequest = useCallback(() => {'), src.indexOf('const clearMessages = useCallback('))
    // Closing it would blind the client to the gateway's own terminal `done`.
    expect(cancelBlock).not.toContain('subscriptionRef.current')
    expect(cancelBlock).toContain('/cancel')
  })
})

describe('turn boundary event classification', () => {
  it('treats the gateway request event as the turn start marker', () => {
    expect(isTurnStartEvent('request')).toBe(true)
    expect(isTurnStartEvent('token')).toBe(false)
    expect(isTurnStartEvent(undefined)).toBe(false)
  })

  it('treats both terminal outcomes as the turn end', () => {
    expect(isTurnEndEvent('done')).toBe(true)
    expect(isTurnEndEvent('error')).toBe(true)
    expect(isTurnEndEvent('tool_result')).toBe(false)
  })
})

describe('parseQueuedChatResponse', () => {
  it('pulls the server-assigned queue entry out of the 202 body', () => {
    const body = [
      `data: ${JSON.stringify({ type: 'queued', message: { id: 'q-1', content: 'later' } })}`,
      '',
      `data: ${JSON.stringify({ type: 'done', session_id: 's1' })}`,
      '',
    ].join('\n')

    expect(parseQueuedChatResponse(body)).toMatchObject({
      type: 'queued',
      message: { id: 'q-1' },
    })
  })

  it('returns null when the body carries no queued event', () => {
    expect(parseQueuedChatResponse(`data: ${JSON.stringify({ type: 'done' })}\n\n`)).toBeNull()
    expect(parseQueuedChatResponse('')).toBeNull()
    // A truncated line must not throw — the WS broadcast is authoritative anyway.
    expect(parseQueuedChatResponse('data: {"type":"que')).toBeNull()
  })
})
