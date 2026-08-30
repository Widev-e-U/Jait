/**
 * Durable SSE subscription for the gateway's per-session event stream
 * (`GET /api/sessions/:id/events`).
 *
 * Why this exists instead of the native `EventSource`
 * --------------------------------------------------
 * `EventSource` gives retry + `Last-Event-ID` replay for free, which is exactly
 * the contract this endpoint speaks. But it cannot send an `Authorization`
 * header, so it only authenticates via the `jait_token` cookie — and that cookie
 * is `sameSite: "lax"`, so it is NOT sent on a cross-origin subscription. The
 * desktop/mobile clients and any browser using the `jait-gateway-url` override
 * talk to a *different* origin than the page and authenticate with a bearer
 * token, so a native `EventSource` would 401 for exactly those clients.
 *
 * This is the same state machine over `fetch`, which can carry the header:
 * connect, parse frames, remember the last `id:`, and on any transport failure
 * reconnect with jittered exponential backoff sending `Last-Event-ID`. The
 * gateway replays everything after that id from its persisted event log, so a
 * reconnect is invisible to the consumer: no gap, no snapshot re-fetch, no
 * client-side reconcile round-trip.
 */

const RECONNECT_BASE_DELAY_MS = 500
const RECONNECT_MAX_DELAY_MS = 30_000
export const SESSION_EVENT_RECONNECT_MAX_ATTEMPTS = 20

/** Server errors worth retrying; a 4xx that isn't one of these is terminal. */
export function isRetryableSubscriptionStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

export function getSubscriptionReconnectDelay(attempt: number, random = Math.random): number {
  const cap = Math.min(
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)),
  )
  return cap / 2 + random() * (cap / 2)
}

export interface SseFrame {
  /** The frame's `id:` field, or null when the server omitted it (heartbeats). */
  id: string | null
  /** Joined `data:` lines. Empty frames (comment-only) are never dispatched. */
  data: string
}

/**
 * Incremental SSE frame parser. Feed it decoded chunks; it calls `onFrame` once
 * per complete `\n\n`-terminated frame. Comment lines (`: keepalive`) are
 * dropped, and a frame with no `data:` line is not dispatched — matching how the
 * `EventSource` spec treats them.
 */
export function createSseFrameParser(onFrame: (frame: SseFrame) => void) {
  let buffer = ''
  let dataLines: string[] = []
  let frameId: string | null = null

  const dispatch = () => {
    if (dataLines.length === 0) {
      frameId = null
      return
    }
    const frame: SseFrame = { id: frameId, data: dataLines.join('\n') }
    dataLines = []
    frameId = null
    onFrame(frame)
  }

  return (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const rawLine of lines) {
      // Tolerate CRLF from proxies that rewrite line endings.
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (line === '') {
        dispatch()
        continue
      }
      if (line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon === -1 ? line : line.slice(0, colon)
      // Per spec a single leading space after the colon is part of the
      // delimiter, not the value.
      let value = colon === -1 ? '' : line.slice(colon + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'data') dataLines.push(value)
      else if (field === 'id') frameId = value
    }
  }
}

export interface SessionEventSubscriptionOptions {
  url: string
  /** Extra request headers — carries `Authorization` for token-auth clients. */
  headers?: Record<string, string>
  /** Log position to resume from. The gateway replays everything after it. */
  lastEventId?: string | null
  /** Called once per data frame, already JSON-parsed. Unparseable frames are dropped. */
  onEvent: (data: Record<string, unknown>) => void
  /** Called when a connection is established (initial and every reconnect). */
  onOpen?: () => void
  /**
   * Called when a connection drops and a retry is scheduled. `attempt` counts
   * consecutive failures — it resets after a connection succeeds — so a caller
   * can show "reconnecting…" only once the outage stops being instantaneous.
   */
  onReconnect?: (attempt: number, delayMs: number) => void
  /** Terminal failure: auth rejected, session gone, or retries exhausted. */
  onFatal?: (reason: 'unauthorized' | 'not-found' | 'exhausted' | 'error', error?: unknown) => void
  fetchImpl?: typeof fetch
  /** Injected for tests; defaults to jittered exponential backoff. */
  reconnectDelay?: (attempt: number) => number
  /** Injected for tests; defaults to `setTimeout`. */
  scheduleRetry?: (fn: () => void, delayMs: number) => void
  /** Injected for tests; defaults to `Date.now`. Used for activity timestamps. */
  now?: () => number
}

export type SessionEventSubscriptionState = 'connecting' | 'open' | 'retrying' | 'closed'

export interface SessionEventSubscriptionHealth {
  state: SessionEventSubscriptionState
  /** Consecutive failed reconnect attempts since the last successful open. */
  attempts: number
  /** Timestamp of the last bytes received on any connection (incl. keepalives). */
  lastActivityAt: number
  /** Timestamp of the last successful connection open; 0 before the first one. */
  lastOpenAt: number
}

export interface SessionEventSubscription {
  close: () => void
  /** The most recent `id:` seen — the resume position if reconnected manually. */
  getLastEventId: () => string | null
  /** Drop the current socket and reconnect immediately (wake from sleep / back online). */
  reconnectNow: () => void
  /** Current transport state + freshness, so callers can skip needless recovery. */
  getHealth: () => SessionEventSubscriptionHealth
}

/**
 * Open a durable subscription that survives transport drops. Returns
 * immediately; the first connection is established asynchronously.
 */
export function openSessionEventSubscription(
  options: SessionEventSubscriptionOptions,
): SessionEventSubscription {
  const {
    url,
    headers = {},
    onEvent,
    onOpen,
    onReconnect,
    onFatal,
    fetchImpl = fetch,
    reconnectDelay = getSubscriptionReconnectDelay,
    scheduleRetry = (fn, delayMs) => { setTimeout(fn, delayMs) },
    now = () => Date.now(),
  } = options

  let lastEventId = options.lastEventId ?? null
  let closed = false
  let attempts = 0
  let controller: AbortController | null = null
  let state: SessionEventSubscriptionState = 'connecting'
  let lastActivityAt = now()
  let lastOpenAt = 0

  const fail = (reason: Parameters<NonNullable<typeof onFatal>>[0], error?: unknown) => {
    closed = true
    controller = null
    state = 'closed'
    onFatal?.(reason, error)
  }

  const retry = () => {
    if (closed) return
    attempts += 1
    if (attempts > SESSION_EVENT_RECONNECT_MAX_ATTEMPTS) {
      fail('exhausted')
      return
    }
    state = 'retrying'
    const delay = reconnectDelay(attempts)
    onReconnect?.(attempts, delay)
    scheduleRetry(() => { if (!closed) void connect() }, delay)
  }

  const connect = async (): Promise<void> => {
    if (closed) return
    const ac = new AbortController()
    controller = ac
    try {
      const res = await fetchImpl(url, {
        signal: ac.signal,
        headers: {
          Accept: 'text/event-stream',
          ...headers,
          ...(lastEventId !== null ? { 'Last-Event-ID': lastEventId } : {}),
        },
        // Send the auth cookie for same-origin/browser-cookie deployments.
        credentials: 'include',
      })
      if (ac.signal.aborted || closed) return
      if (res.status === 401) return fail('unauthorized')
      if (res.status === 404) return fail('not-found')
      if (!res.ok) {
        if (!isRetryableSubscriptionStatus(res.status)) return fail('error')
        void res.body?.cancel()
        retry()
        return
      }
      const reader = res.body?.getReader()
      if (!reader) {
        retry()
        return
      }

      // A live connection resets the backoff ladder, so a later drop starts
      // from the base delay rather than inheriting a long stale backoff.
      attempts = 0
      state = 'open'
      lastOpenAt = now()
      lastActivityAt = lastOpenAt
      onOpen?.()

      const decoder = new TextDecoder()
      const feed = createSseFrameParser((frame) => {
        // Only advance the resume position for frames the server identified.
        // Heartbeats carry no `id:`, so they never move it.
        if (frame.id !== null) lastEventId = frame.id
        let parsed: unknown
        try {
          parsed = JSON.parse(frame.data)
        } catch {
          return
        }
        if (!parsed || typeof parsed !== 'object') return
        onEvent(parsed as Record<string, unknown>)
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (closed || ac.signal.aborted) {
          void reader.cancel()
          return
        }
        // Every byte counts as liveness, including keepalive/heartbeat frames —
        // a parked-but-healthy hidden tab sees these every ~15s.
        lastActivityAt = now()
        feed(decoder.decode(value, { stream: true }))
      }
      // `/events` never ends on its own, so a clean end-of-body is a dropped
      // connection (proxy idle timeout, server restart). Reconnect and replay.
      if (!closed && !ac.signal.aborted) retry()
    } catch (error) {
      if (closed || ac.signal.aborted) return
      if (error instanceof Error && error.name === 'AbortError') return
      retry()
    } finally {
      if (controller === ac) controller = null
    }
  }

  void connect()

  return {
    close: () => {
      if (closed) return
      closed = true
      state = 'closed'
      controller?.abort()
      controller = null
    },
    getLastEventId: () => lastEventId,
    reconnectNow: () => {
      if (closed) return
      attempts = 0
      state = 'connecting'
      lastActivityAt = now()
      const previous = controller
      controller = null
      previous?.abort()
      void connect()
    },
    getHealth: () => ({ state, attempts, lastActivityAt, lastOpenAt }),
  }
}
