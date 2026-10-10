import { getApiUrl } from './gateway-url'
import type { TerminalInfo } from '@/components/terminal/terminal-view'

// One snapshot request for the terminal list and all visible tool cards.
// Execution events and socket reconnects invalidate it; there is no timer.
const snapshots = new Map<string, { promise: Promise<TerminalInfo[]>; pending: boolean }>()
let version = 0
const listeners = new Set<() => void>()

export function subscribeTerminalSnapshot(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getTerminalSnapshotVersion(): number {
  return version
}

export function invalidateTerminalSnapshot(): void {
  snapshots.clear()
  version += 1
  for (const listener of listeners) listener()
}

export function loadTerminalSnapshot(token?: string | null, fresh = false): Promise<TerminalInfo[]> {
  const key = token ?? ''
  const cached = snapshots.get(key)
  if (cached && (!fresh || cached.pending)) return cached.promise
  const entry = { promise: Promise.resolve([] as TerminalInfo[]), pending: true }
  entry.promise = fetch(getApiUrl() + '/api/terminals', {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  }).then(async response => {
    if (!response.ok) throw new Error('Terminal snapshot unavailable')
    const payload = await response.json() as { terminals?: TerminalInfo[] }
    return payload.terminals ?? []
  }).then(terminals => {
    entry.pending = false
    return terminals
  }, error => {
    if (snapshots.get(key) === entry) snapshots.delete(key)
    throw error
  })
  snapshots.set(key, entry)
  return entry.promise
}
