import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { gitApi, type GitStatusResult } from './git-api'

/**
 * Shared, project-scoped git change counts.
 *
 * One store keeps the latest `git status` counts per `nodeId::projectRoot` key
 * and fans them out to every badge that should react to file changes: the chat
 * "file changes" pill, the source control icon badges (top toolbar, bottom nav,
 * project panel tab). Consuming a project's counts always clears the previous
 * project's totals until its own status arrives — that's the contract the pill
 * relies on when switching between projects.
 */

export interface GitChangeCounts {
  /** Number of files with uncommitted changes (staged + working tree). */
  fileCount: number
  insertions: number
  deletions: number
  /** False until this project's first status has landed. */
  ready: boolean
  branch: string | null
  status: GitStatusResult | null
}

interface GitChangeCountsEntry {
  key: string
  snapshot: GitChangeCounts
  loading: boolean
  requestSeq: number
}

const EMPTY_COUNTS: GitChangeCounts = {
  fileCount: 0,
  insertions: 0,
  deletions: 0,
  ready: false,
  branch: null,
  status: null,
}

const entries = new Map<string, GitChangeCountsEntry>()
const listeners = new Map<string, Set<() => void>>()
const timers = new Map<string, number>()
const inflight = new Map<string, Promise<void>>()

const POLL_INTERVAL_MS = 15_000

export function gitChangeCountsKey(nodeId: string | null | undefined, projectRoot: string): string {
  const node = nodeId?.trim() || 'gateway'
  const root = projectRoot.trim()
  return root ? `${node}::${root}` : ''
}

function entryFor(key: string): GitChangeCountsEntry {
  let entry = entries.get(key)
  if (!entry) {
    entry = { key, snapshot: EMPTY_COUNTS, loading: false, requestSeq: 0 }
    entries.set(key, entry)
  }
  return entry
}

function listenersFor(key: string): Set<() => void> {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  return set
}

function emit(key: string): void {
  const set = listeners.get(key)
  if (!set) return
  for (const listener of set) listener()
}

function applyStatus(key: string, status: GitStatusResult | null, seq: number): void {
  const entry = entryFor(key)
  if (seq !== entry.requestSeq) return
  const staged = status?.index.files.length ?? 0
  const workingTree = status?.workingTree.files.length ?? 0
  entry.snapshot = {
    fileCount: staged + workingTree,
    insertions: (status?.index.insertions ?? 0) + (status?.workingTree.insertions ?? 0),
    deletions: (status?.index.deletions ?? 0) + (status?.workingTree.deletions ?? 0),
    ready: status !== null,
    branch: status?.branch ?? null,
    status,
  }
  entry.loading = false
  emit(key)
}

/** Fetch counts for a key; concurrent callers share one request. */
function load(key: string, nodeId: string | null | undefined, projectRoot: string): Promise<void> {
  const existing = inflight.get(key)
  if (existing) return existing

  const entry = entryFor(key)
  entry.loading = true
  const seq = ++entry.requestSeq
  const promise = gitApi.status(projectRoot, undefined, nodeId ?? undefined)
    .then((status) => { applyStatus(key, status, seq) })
    .catch(() => { applyStatus(key, null, seq) })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}

function startPolling(key: string, nodeId: string | null | undefined, projectRoot: string): void {
  if (timers.has(key)) return
  const timer = window.setInterval(() => { void load(key, nodeId, projectRoot) }, POLL_INTERVAL_MS)
  timers.set(key, timer)
}

function stopPolling(key: string): void {
  const timer = timers.get(key)
  if (timer === undefined) return
  window.clearInterval(timer)
  timers.delete(key)
}

function subscribe(key: string, listener: () => void): () => void {
  const set = listenersFor(key)
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) {
      listeners.delete(key)
      stopPolling(key)
    }
  }
}

export function getGitChangeCounts(key: string): GitChangeCounts {
  if (!key) return EMPTY_COUNTS
  return entryFor(key).snapshot
}

/** Force a refetch (e.g. after commits/refresh) — resolves when counts settle. */
export function refreshGitChangeCounts(
  nodeId: string | null | undefined,
  projectRoot: string | null | undefined,
): Promise<void> {
  if (!projectRoot) return Promise.resolve()
  const key = gitChangeCountsKey(nodeId, projectRoot)
  if (!key) return Promise.resolve()
  return load(key, nodeId, projectRoot)
}

/**
 * Subscribe a component to the shared counts for one project. Bumping
 * `refreshSignal` forces a refetch (used by explicit "refresh" buttons).
 */
export function useGitChangeCounts(
  nodeId: string | null | undefined,
  projectRoot: string | null | undefined,
  refreshSignal: number,
): GitChangeCounts {
  const key = projectRoot ? gitChangeCountsKey(nodeId, projectRoot) : ''

  useEffect(() => {
    if (!key || !projectRoot) return
    const entry = entryFor(key)
    // For a fresh key the snapshot is empty until this project's status lands.
    const shouldLoad = entry.loading || entry.requestSeq === 0 || refreshSignal !== 0
    if (shouldLoad) void load(key, nodeId, projectRoot)
    startPolling(key, nodeId, projectRoot)
    return subscribe(key, () => {})
  }, [key, nodeId, projectRoot, refreshSignal])

  const subscribeToKey = useCallback(
    (listener: () => void) => (key ? subscribe(key, listener) : () => {}),
    [key],
  )
  const getSnapshot = useCallback(() => getGitChangeCounts(key), [key])

  return useSyncExternalStore(subscribeToKey, getSnapshot, getSnapshot)
}