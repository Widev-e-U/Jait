import { useCallback, useEffect, useRef, useState } from 'react'
import { getApiUrl } from '@/lib/gateway-url'
import type { TrajectoryStreamEvent } from '@jait/shared'
import type { SSEDebugEvent } from './sse-debug-panel'

const API_URL = getApiUrl()

/** Quiet period after the last replayed event before the history counts as loaded. */
const REPLAY_SETTLE_MS = 150

function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

export interface SessionTrajectoryState {
  /** Events in log_id order (replay history first, then live). */
  events: SSEDebugEvent[]
  /** True while the gateway SSE stream is open. */
  connected: boolean
  /** True once the persisted history replay has been published (or the log is empty). */
  loaded: boolean
  /** Drop the locally accumulated events (view reset). */
  clear: () => void
}

/**
 * Subscribes to the gateway's per-session trajectory SSE stream:
 * a replay of the persisted stream-event log (old data) followed by live
 * events, so an opened trajectory panel shows the whole session history and
 * keeps streaming new turns. Events are deduped by `log_id`, so reconnects
 * (and the replay-after-reconnect) never double-render a step.
 */
export function useSessionTrajectory(sessionId: string | null, token: string | null): SessionTrajectoryState {
  const [events, setEvents] = useState<SSEDebugEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const eventsRef = useRef<SSEDebugEvent[]>([])
  const maxLogIdRef = useRef(0)

  const clear = useCallback(() => {
    eventsRef.current = []
    maxLogIdRef.current = 0
    setEvents([])
  }, [])

  useEffect(() => {
    // Reset per-session state on any change (new session or new token) — the
    // gateway numbers log_ids per session, so the previous session's high-water
    // mark must not suppress the new session's replay.
    eventsRef.current = []
    maxLogIdRef.current = 0
    setEvents([])
    setLoaded(false)
    if (!sessionId || !token) {
      setConnected(false)
      return
    }

    let cancelled = false
    let controller: AbortController | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    let pending: SSEDebugEvent[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flush = () => {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = null
      if (cancelled) return
      if (pending.length > 0) {
        eventsRef.current = [...eventsRef.current, ...pending]
        pending = []
        setEvents(eventsRef.current)
      }
      setLoaded(true)
    }

    const appendEvent = (ev: TrajectoryStreamEvent) => {
      const logId = Number(ev.log_id)
      if (!Number.isFinite(logId) || logId <= maxLogIdRef.current) return
      maxLogIdRef.current = logId
      const payload = ev.payload ?? {}
      const raw = JSON.stringify(payload)
      const wrapped: SSEDebugEvent = {
        id: logId,
        ts: Number(ev.ts) || Date.now(),
        type: String((payload as { type?: unknown }).type ?? 'unknown'),
        raw,
      }
      pending.push(wrapped)
      if (ev.replay) {
        // Replayed history arrives as a burst: collect it and publish once the
        // burst settles, instead of re-rendering (and visibly spawning) per event.
        if (flushTimer) clearTimeout(flushTimer)
        flushTimer = setTimeout(flush, REPLAY_SETTLE_MS)
      } else {
        flush()
      }
    }

    const scheduleReconnect = () => {
      if (cancelled || retryTimer) return
      attempts += 1
      // Capped exponential backoff — same idea as the chat resume stream: the
      // gateway may be mid-restart or a proxy may have dropped the socket.
      const delay = Math.min(30_000, 500 * Math.pow(2, Math.min(attempts - 1, 6)))
      retryTimer = setTimeout(() => {
        retryTimer = null
        connect()
      }, delay)
    }

    const connect = () => {
      if (cancelled) return
      controller = new AbortController()
      fetch(`${API_URL}/api/sessions/${encodeURIComponent(sessionId)}/trajectory`, {
        headers: authHeaders(token),
        signal: controller.signal,
      })
        .then((res) => {
          if (cancelled) return
          if (!res.ok) throw new Error(`trajectory stream ${res.status}`)
          attempts = 0
          setConnected(true)
          // An empty log sends no replay events — don't hold the panel hidden.
          if (!flushTimer) flushTimer = setTimeout(flush, REPLAY_SETTLE_MS)
          const reader = res.body?.getReader()
          if (!reader) return
          const decoder = new TextDecoder()
          let buffer = ''
          const pump = (): Promise<void> =>
            reader.read().then(({ done, value }) => {
              if (done) return
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue
                let data: TrajectoryStreamEvent
                try {
                  data = JSON.parse(line.slice(6)) as TrajectoryStreamEvent
                } catch {
                  continue
                }
                if (data.type !== 'trajectory_event') continue
                appendEvent(data)
              }
              return pump()
            })
          return pump()
        })
        .catch(() => {
          if (cancelled) return
          setConnected(false)
          scheduleReconnect()
        })
        .finally(() => {
          // Stream ended cleanly without an error — still reconnect so the
          // panel keeps following later turns (unless a retry is scheduled).
          if (!cancelled && !retryTimer && controller?.signal && !controller.signal.aborted) {
            setConnected(false)
            scheduleReconnect()
          }
        })
    }

    connect()
    return () => {
      cancelled = true
      if (flushTimer) clearTimeout(flushTimer)
      if (retryTimer) clearTimeout(retryTimer)
      controller?.abort()
    }
  }, [sessionId, token])

  return { events, connected, loaded, clear }
}
