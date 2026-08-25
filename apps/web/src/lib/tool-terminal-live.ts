import type { TerminalExecutionPayload } from '@jait/shared'

/**
 * Live registry of "which terminal is this tool call running in".
 *
 * A running terminal tool card can only embed a real terminal if it knows the
 * terminal id and the output offset the command starts at. Both are settled on
 * the gateway *before* the command reaches the PTY, but the tool result — the
 * only place they used to appear — lands after the command has already
 * finished. Discovering them by polling `/api/terminals` mid-run works, but the
 * card stays a dead text box for as long as the poll takes, which is most of
 * the lifetime of a short command.
 *
 * So the gateway pushes the binding on `terminal.execution` instead, and this
 * module holds the pushed bindings for cards to read synchronously.
 */

export interface LiveToolTerminalExecution {
  terminalId: string
  sessionId: string
  command: string
  actionId: string
  startedAt: string
  completedAt: string | null
  outputOffset: number
  outputEndOffset: number | null
  isBackground: boolean
  watched: boolean | null
}

/**
 * Completed executions are kept briefly: the tool result arrives on a different
 * channel (SSE) than this event (WebSocket), so dropping the binding the moment
 * the command finishes can blank an already-attached card for a frame or two.
 */
const COMPLETED_RETENTION_MS = 60_000

let entries: LiveToolTerminalExecution[] = []
const listeners = new Set<() => void>()

function emit(next: LiveToolTerminalExecution[]): void {
  entries = next
  for (const listener of listeners) listener()
}

function isExpired(entry: LiveToolTerminalExecution, now: number): boolean {
  if (!entry.completedAt) return false
  const completedAt = Date.parse(entry.completedAt)
  return Number.isFinite(completedAt) && now - completedAt > COMPLETED_RETENTION_MS
}

export function subscribeLiveToolTerminals(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getLiveToolTerminals(): LiveToolTerminalExecution[] {
  return entries
}

/** Test seam — reset module state between cases. */
export function resetLiveToolTerminals(): void {
  emit([])
}

export function applyTerminalExecutionEvent(
  sessionId: string,
  payload: TerminalExecutionPayload | null | undefined,
  now = Date.now(),
): void {
  const terminalId = payload?.terminalId
  if (!terminalId) return

  const kept = entries.filter((entry) => entry.terminalId !== terminalId && !isExpired(entry, now))
  const execution = payload.execution
  if (!execution) {
    // The call released the terminal without a retainable slice (cancelled, or
    // a background command the monitor stopped watching).
    if (kept.length !== entries.length) emit(kept)
    return
  }

  emit([...kept, { terminalId, sessionId, ...execution }])
}

/**
 * Picks the binding a tool card should attach to. Mirrors `findToolTerminal`'s
 * precedence: an explicit terminal id wins, then this session's most recent
 * execution of the same command, then its most recent execution overall.
 */
export function findLiveToolTerminal(
  liveEntries: LiveToolTerminalExecution[],
  options: { terminalId?: string | null; sessionId?: string | null; command?: string | null },
): LiveToolTerminalExecution | null {
  // A call that already knows its terminal takes that one or nothing: falling
  // back to "whatever ran most recently" would let a finished card from an
  // older turn latch onto an unrelated command that is running right now.
  if (options.terminalId) {
    return liveEntries.find((entry) => entry.terminalId === options.terminalId) ?? null
  }
  if (!options.sessionId) return null

  const sessionEntries = liveEntries
    .filter((entry) => entry.sessionId === options.sessionId)
    .sort((left, right) => (Date.parse(right.startedAt) || 0) - (Date.parse(left.startedAt) || 0))
  const byCommand = options.command
    ? sessionEntries.find((entry) => entry.command === options.command)
    : null
  return byCommand ?? sessionEntries[0] ?? null
}
