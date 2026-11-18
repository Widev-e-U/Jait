/**
 * Reasons a chat is currently stopped, keyed by wait key.
 *
 * The gateway broadcasts the *full* wait list for a session whenever it
 * changes (`session-wait.updated`) and a full snapshot on reconnect
 * (`session-wait.snapshot`), so this map is replaced wholesale per session
 * rather than diffed per key. Wait keys are stable (`terminal:<id>`,
 * `browser:<sessionId>`, `attentionKey(...)` for request-backed prompts), which
 * is what makes the replace-per-session approach safe.
 */
import type { SessionWait, SessionWaitKind } from '@jait/shared'

export type SessionWaitMap = ReadonlyMap<string, SessionWait>

const BLOCKING_ORDER: readonly SessionWaitKind[] = [
  'question',
  'consent',
  'secret',
  'browser',
  'terminal',
  'background',
]

function isSessionWait(value: unknown): value is SessionWait {
  if (!value || typeof value !== 'object') return false
  const wait = value as Partial<Record<keyof SessionWait, unknown>>
  return (
    typeof wait.key === 'string'
    && typeof wait.kind === 'string'
    && typeof wait.sessionId === 'string'
    && typeof wait.label === 'string'
    && typeof wait.blocking === 'boolean'
  )
}

function replaceSessionWaits(current: SessionWaitMap, waits: SessionWait[]): SessionWaitMap {
  const next = new Map(current)
  // A chat can report several reasons at once (e.g. a question while a
  // background command keeps running), so drop only this session's keys.
  const changedSessions = new Set(waits.map((wait) => wait.sessionId))
  let changed = false
  for (const [key, wait] of next) {
    if (changedSessions.has(wait.sessionId)) {
      next.delete(key)
      changed = true
    }
  }
  for (const wait of waits) {
    const previous = next.get(wait.key)
    next.set(wait.key, wait)
    if (previous !== wait) changed = true
  }
  // Unchanged state keeps the old reference so memoized rows do not re-render.
  return changed ? next : current
}

export function applySessionWaitEvent(
  waits: SessionWaitMap,
  event: { type: string; payload: unknown },
): SessionWaitMap {
  const payload = event.payload as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object') return waits

  if (event.type === 'session-wait.updated') {
    if (!Array.isArray(payload.waits)) return waits
    const received = payload.waits.filter(isSessionWait)
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined
    // The payload is authoritative for its session (possibly an empty list =
    // "nothing blocking anymore"), so clear stale keys even when nothing came.
    if (sessionId && received.length === 0) {
      const next = new Map(waits)
      for (const [key, wait] of next) {
        if (wait.sessionId === sessionId) next.delete(key)
      }
      return next.size === waits.size ? waits : next
    }
    return replaceSessionWaits(waits, received)
  }

  if (event.type === 'session-wait.snapshot') {
    if (!Array.isArray(payload.waits)) return waits
    const next = new Map<string, SessionWait>()
    for (const wait of payload.waits) {
      if (isSessionWait(wait)) next.set(wait.key, wait)
    }
    return next
  }

  return waits
}

/** Waits for one chat, most urgent first. */
export function sessionWaitsForSession(waits: SessionWaitMap, sessionId: string): SessionWait[] {
  return [...waits.values()]
    .filter((wait) => wait.sessionId === sessionId)
    .sort((a, b) => BLOCKING_ORDER.indexOf(a.kind) - BLOCKING_ORDER.indexOf(b.kind))
}

/**
 * The wait that should drive a chat row's icon: the blocking reason if there is
 * one, otherwise the non-blocking one (a running background command).
 */
export function primarySessionWait(
  waits: SessionWaitMap,
  sessionId: string,
): SessionWait | undefined {
  return sessionWaitsForSession(waits, sessionId)[0]
}

/**
 * One wait per session, for rendering a long session list without rescanning
 * the whole map per row.
 */
export function primarySessionWaits(waits: SessionWaitMap): ReadonlyMap<string, SessionWait> {
  const primary = new Map<string, SessionWait>()
  for (const wait of waits.values()) {
    const current = primary.get(wait.sessionId)
    // Same urgency order as sessionWaitsForSession, so the row icon does not
    // depend on the order the gateway happened to list its waits in.
    if (!current || BLOCKING_ORDER.indexOf(wait.kind) < BLOCKING_ORDER.indexOf(current.kind)) {
      primary.set(wait.sessionId, wait)
    }
  }
  return primary
}

/** Session IDs with at least one blocking wait — used by sidebar attention counts. */
export function blockingWaitSessionIds(waits: SessionWaitMap): ReadonlySet<string> {
  const sessions = new Set<string>()
  for (const wait of waits.values()) {
    if (wait.blocking) sessions.add(wait.sessionId)
  }
  return sessions
}
