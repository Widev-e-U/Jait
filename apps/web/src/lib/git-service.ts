import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { gitApi as transport, onGitMutation, type GitStatusResult, type FileDiffEntry } from './git-transport'
export * from './git-transport'

/** One owner for Git requests, repository snapshots, polling and invalidation.
 * Keys include the node and optional comparison branch: identical paths on two
 * machines must never share state. Full file contents are fetched only on demand.
 */
export interface GitChangeCounts {
  fileCount: number
  insertions: number
  deletions: number
  ready: boolean
  loading: boolean
  error: string | null
  branch: string | null
  status: GitStatusResult | null
}
const EMPTY: GitChangeCounts = {
  fileCount: 0, insertions: 0, deletions: 0, ready: false,
  loading: false, error: null, branch: null, status: null,
}
interface Entry {
  cwd: string
  nodeId: string
  branch?: string
  snapshot: GitChangeCounts
  listeners: Set<() => void>
  updatedAt: number
  generation: number
  inflight?: Promise<GitStatusResult>
  cleanup?: () => void
}
const entries = new Map<string, Entry>()
const diffRequests = new Map<string, Promise<FileDiffEntry[]>>()
const FRESH_MS = 1_000
const POLL_MS = 15_000

export function gitChangeCountsKey(nodeId: string | null | undefined, cwd: string): string {
  return cwd ? JSON.stringify([nodeId?.trim() || 'gateway', cwd]) : ''
}
function keyFor(cwd: string, nodeId?: string | null, branch?: string): string {
  return branch ? JSON.stringify([nodeId?.trim() || 'gateway', cwd, branch]) : gitChangeCountsKey(nodeId, cwd)
}
function entryFor(cwd: string, nodeId?: string | null, branch?: string): Entry {
  const key = keyFor(cwd, nodeId, branch)
  let entry = entries.get(key)
  if (!entry) {
    // Bound inactive project history without evicting mounted or running entries.
    if (entries.size >= 64) {
      for (const [oldKey, old] of entries) {
        if (!old.listeners.size && !old.inflight) entries.delete(oldKey)
        if (entries.size < 64) break
      }
    }
    entry = { cwd, nodeId: nodeId?.trim() || 'gateway', branch, snapshot: EMPTY, listeners: new Set(), updatedAt: 0, generation: 0 }
    entries.set(key, entry)
  }
  return entry
}
// Fingerprints are memoised per response object: polling usually returns the
// same object (or a deep-equal one) and we only ever serialise each object once.
const statusFingerprints = new WeakMap<GitStatusResult, string>()
function statusFingerprint(status: GitStatusResult | null): string {
  if (!status) return ''
  let fingerprint = statusFingerprints.get(status)
  if (fingerprint === undefined) {
    fingerprint = JSON.stringify(status)
    statusFingerprints.set(status, fingerprint)
  }
  return fingerprint
}
function sameSnapshot(a: GitChangeCounts, b: GitChangeCounts): boolean {
  if (a === b) return true
  if (a.ready !== b.ready || a.loading !== b.loading || a.error !== b.error) return false
  if (a.branch !== b.branch || a.fileCount !== b.fileCount) return false
  if (a.insertions !== b.insertions || a.deletions !== b.deletions) return false
  // Scalars matched: only serialise the status payloads when they differ by reference.
  return a.status === b.status || statusFingerprint(a.status) === statusFingerprint(b.status)
}
function publish(entry: Entry, snapshot: GitChangeCounts): void {
  if (sameSnapshot(entry.snapshot, snapshot)) return
  entry.snapshot = snapshot
  for (const listener of entry.listeners) listener()
}
function countChangedFiles(status: GitStatusResult): number {
  const paths = new Set<string>()
  for (const file of status.index.files) paths.add(file.path)
  for (const file of status.workingTree.files) paths.add(file.path)
  return paths.size
}
function readStatus(entry: Entry): Promise<GitStatusResult> {
  if (entry.inflight) return entry.inflight
  if (entry.updatedAt && Date.now() - entry.updatedAt < FRESH_MS && entry.snapshot.status) {
    return Promise.resolve(entry.snapshot.status)
  }
  // Coalesce same-turn refreshes (badge, HUD, watcher and panel) before starting.
  const request = Promise.resolve().then(async () => {
    if (!entry.snapshot.ready) publish(entry, { ...entry.snapshot, loading: true })
    for (;;) {
      const generation = entry.generation
      try {
        const status = await transport.status(entry.cwd, entry.branch, entry.nodeId)
        if (generation !== entry.generation) continue
        entry.updatedAt = Date.now()
        publish(entry, {
          status, ready: true, loading: false, error: null, branch: status.branch,
          fileCount: countChangedFiles(status),
          insertions: status.index.insertions + status.workingTree.insertions,
          deletions: status.index.deletions + status.workingTree.deletions,
        })
        return status
      } catch (error) {
        if (generation !== entry.generation) continue
        publish(entry, { ...entry.snapshot, loading: false, error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    }
  }).finally(() => { entry.inflight = undefined })
  entry.inflight = request
  return request
}
function invalidate(entry: Entry): void {
  entry.updatedAt = 0
  entry.generation++
}
function refresh(entry: Entry): Promise<void> {
  invalidate(entry)
  return readStatus(entry).then(() => {}, () => {})
}

onGitMutation((cwd, nodeId) => {
  for (const entry of entries.values()) {
    if (entry.cwd !== cwd || entry.nodeId !== (nodeId || 'gateway')) continue
    invalidate(entry)
    if (entry.listeners.size) void readStatus(entry).catch(() => {})
  }
})

export const gitApi: typeof transport = {
  ...transport,
  status(cwd, branch, nodeId) { return readStatus(entryFor(cwd, nodeId, branch)) },
  fileDiffs(cwd, baseBranch, branch, nodeId, paths) {
    const key = JSON.stringify([nodeId || 'gateway', cwd, baseBranch, branch, paths?.length ? [...paths].sort() : null])
    const existing = diffRequests.get(key)
    if (existing) return existing
    const request = transport.fileDiffs(cwd, baseBranch, branch, nodeId, paths)
      .finally(() => { diffRequests.delete(key) })
    diffRequests.set(key, request)
    return request
  },
}

export function getGitChangeCounts(key: string): GitChangeCounts {
  return entries.get(key)?.snapshot ?? EMPTY
}
export function refreshGitChangeCounts(nodeId: string | null | undefined, cwd: string | null | undefined): Promise<void> {
  return cwd ? refresh(entryFor(cwd, nodeId)) : Promise.resolve()
}
function subscribe(entry: Entry, listener: () => void): () => void {
  entry.listeners.add(listener)
  if (!entry.cleanup) {
    const load = () => { if (document.visibilityState !== 'hidden') void readStatus(entry).catch(() => {}) }
    const timer = window.setInterval(load, POLL_MS)
    document.addEventListener('visibilitychange', load)
    entry.cleanup = () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
    }
    load()
  }
  return () => {
    entry.listeners.delete(listener)
    if (!entry.listeners.size) {
      entry.cleanup?.()
      entry.cleanup = undefined
    }
  }
}
export function useGitChangeCounts(nodeId: string | null | undefined, cwd: string | null | undefined, refreshSignal = 0): GitChangeCounts {
  const key = cwd ? gitChangeCountsKey(nodeId, cwd) : ''
  const subscribeToKey = useCallback((listener: () => void) => cwd ? subscribe(entryFor(cwd, nodeId), listener) : () => {}, [key])
  const getSnapshot = useCallback(() => getGitChangeCounts(key), [key])
  const previous = useRef({ key, refreshSignal })
  useEffect(() => {
    if (previous.current.key === key && previous.current.refreshSignal !== refreshSignal) {
      void refreshGitChangeCounts(nodeId, cwd)
    }
    previous.current = { key, refreshSignal }
  }, [key, refreshSignal, cwd, nodeId])
  return useSyncExternalStore(subscribeToKey, getSnapshot, () => EMPTY)
}
