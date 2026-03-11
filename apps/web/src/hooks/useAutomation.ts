/**
 * useAutomation — hook encapsulating Manager-mode state.
 *
 * Manages repositories (DB-backed via API), threads, activities, and providers
 * for the automation / "Manager" workflow.  Extracted from AutomationPage
 * so it can be used inside the merged Chat view.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  agentsApi,
  type AgentThread,
  type ThreadActivity,
  type ProviderInfo,
  type ProviderId,
  type AutomationRepo,
} from '@/lib/agents-api'
import {
  inferSharedRepositories,
  threadBelongsToRepository,
  type AutomationRepository,
} from '@/lib/automation-repositories'
import { gitApi, type GitStatusPr } from '@/lib/git-api'
import { generateDeviceId } from '@/lib/device-id'

// ── Types ────────────────────────────────────────────────────────────

export type RepositoryConnection = AutomationRepository

export type ThreadPrState = GitStatusPr['state'] | null

// ── Helpers ──────────────────────────────────────────────────────────

/** Extract the last segment of a path as the repo display name. */
function folderName(p: string): string {
  const normalized = p.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? p
}

/** Generate a short feature branch name: jait/<8-hex> */
function generateBranchName(): string {
  const hex = Math.random().toString(16).slice(2, 10)
  return `jait/${hex}`
}

/** Render thread activity in chat order (oldest → newest). */
function sortActivities(activities: ThreadActivity[]): ThreadActivity[] {
  return [...activities].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

function mergeActivities(
  current: ThreadActivity[],
  incoming: ThreadActivity[],
): ThreadActivity[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((activity) => [activity.id, activity]))
  for (const activity of incoming) {
    byId.set(activity.id, activity)
  }
  return sortActivities([...byId.values()])
}

/** Convert DB repo row to frontend AutomationRepository */
function dbRepoToLocal(repo: AutomationRepo, localDeviceId: string): RepositoryConnection {
  return {
    id: repo.id,
    name: repo.name,
    defaultBranch: repo.defaultBranch,
    localPath: repo.localPath,
    deviceId: repo.deviceId,
    source: (!repo.deviceId || repo.deviceId === localDeviceId) ? 'local' : 'shared',
  }
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useAutomation(enabled = true) {
  // Stable device ID for this client
  const localDeviceId = useMemo(() => generateDeviceId(), [])

  // Repositories (DB-backed)
  const [localRepositories, setLocalRepositories] = useState<RepositoryConnection[]>([])
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)

  // Threads
  const [threads, setThreads] = useState<AgentThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [activities, setActivities] = useState<ThreadActivity[]>([])
  const [threadPrStates, setThreadPrStates] = useState<Record<string, ThreadPrState>>({})
  const [ghAvailable, setGhAvailable] = useState(true)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Send state
  const activityEndRef = useRef<HTMLDivElement | null>(null)
  const activityCacheRef = useRef(new Map<string, ThreadActivity[]>())

  const sharedRepositories = useMemo(
    () => inferSharedRepositories(threads, localRepositories),
    [threads, localRepositories],
  )
  const repositories = useMemo(
    () => [...localRepositories, ...sharedRepositories],
    [localRepositories, sharedRepositories],
  )

  const selectedRepo = useMemo(
    () => repositories.find((r) => r.id === selectedRepoId) ?? null,
    [repositories, selectedRepoId],
  )
  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  )
  const getRepositoryForThread = useCallback(
    (thread: Pick<AgentThread, 'title' | 'workingDirectory'>) =>
      repositories.find((repository) => threadBelongsToRepository(thread, repository)) ?? null,
    [repositories],
  )

  const showGitActions = useMemo(
    () =>
      selectedThread != null &&
      selectedRepo != null &&
      selectedRepo.source === 'local' &&
      (selectedThread.status === 'completed' || Boolean(selectedThread.prUrl)),
    [selectedThread, selectedRepo],
  )

  // ── Auto-select first repo ────────────────────────────────────

  useEffect(() => {
    if (!enabled) return
    if (!selectedRepoId && repositories.length > 0) {
      setSelectedRepoId(repositories[0].id)
    }
    if (selectedRepoId && repositories.every((r) => r.id !== selectedRepoId)) {
      setSelectedRepoId(repositories[0]?.id ?? null)
    }
  }, [repositories, selectedRepoId, enabled])

  useEffect(() => {
    if (!enabled || !selectedThread) return
    const repository = getRepositoryForThread(selectedThread)
    if (repository && repository.id !== selectedRepoId) {
      setSelectedRepoId(repository.id)
    }
  }, [enabled, getRepositoryForThread, selectedRepoId, selectedThread])

  // ── Data fetching ──────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('token')) return // skip when not authenticated
    setLoading(true)
    try {
      const [ts, provResult, repos] = await Promise.all([
        agentsApi.listThreads(),
        agentsApi.listProviders(),
        agentsApi.listRepos(),
      ])
      setThreads(ts)
      setProviders(provResult.providers)
      setLocalRepositories(repos.map(r => dbRepoToLocal(r, localDeviceId)))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch threads + providers once on mount (no polling — WS pushes updates)
  useEffect(() => {
    if (!enabled) return
    void refresh()
  }, [refresh, enabled])

  // ── WS-driven thread event handler ────────────────────────────

  const selectedThreadIdRef = useRef(selectedThreadId)
  selectedThreadIdRef.current = selectedThreadId

  const handleThreadEvent = useCallback((eventType: string, payload: Record<string, unknown>) => {
    switch (eventType) {
      case 'thread.created': {
        const thread = payload.thread as AgentThread | undefined
        if (thread) {
          setThreads(prev => {
            // Deduplicate — the creating client may already have it from REST
            if (prev.some(t => t.id === thread.id)) return prev
            return [thread, ...prev]
          })
        }
        break
      }
      case 'thread.updated': {
        const thread = payload.thread as AgentThread | undefined
        if (thread) setThreads(prev => prev.map(t => t.id === thread.id ? thread : t))
        break
      }
      case 'thread.deleted': {
        const threadId = payload.threadId as string | undefined
        if (threadId) {
          activityCacheRef.current.delete(threadId)
          setThreads(prev => prev.filter(t => t.id !== threadId))
          if (selectedThreadIdRef.current === threadId) setSelectedThreadId(null)
        }
        break
      }
      case 'thread.status': {
        const threadId = payload.threadId as string | undefined
        const status = payload.status as string | undefined
        if (threadId && status) {
          setThreads(prev => prev.map(t =>
            t.id === threadId
              ? {
                  ...t,
                  status: status as AgentThread['status'],
                  // Clear stale error when transitioning to running/completed
                  error: status === 'running' || status === 'completed'
                    ? (payload.error as string) ?? null
                    : (payload.error as string) ?? t.error,
                }
              : t,
          ))
        }
        break
      }
      case 'thread.activity': {
        const threadId = payload.threadId as string | undefined
        const activity = payload.activity as ThreadActivity | undefined
        if (threadId && activity) {
          const nextActivities = mergeActivities(
            activityCacheRef.current.get(threadId) ?? [],
            [activity],
          )
          activityCacheRef.current.set(threadId, nextActivities)
          if (threadId === selectedThreadIdRef.current) {
            setActivities(nextActivities)
          }
        }
        break
      }
      // ── Repo events (synced across all devices) ─────────────────
      case 'repo.created': {
        const repo = payload.repo as AutomationRepo | undefined
        if (repo) {
          setLocalRepositories(prev => {
            if (prev.some(r => r.id === repo.id)) return prev
            return [dbRepoToLocal(repo, localDeviceId), ...prev]
          })
        }
        break
      }
      case 'repo.updated': {
        const repo = payload.repo as AutomationRepo | undefined
        if (repo) {
          setLocalRepositories(prev =>
            prev.map(r => r.id === repo.id ? dbRepoToLocal(repo, localDeviceId) : r),
          )
        }
        break
      }
      case 'repo.deleted': {
        const repoId = payload.repoId as string | undefined
        if (repoId) {
          setLocalRepositories(prev => prev.filter(r => r.id !== repoId))
          setSelectedRepoId(prev => prev === repoId ? null : prev)
        }
        break
      }
    }
  }, [])

  // Fetch activities once when selected thread changes (no polling)
  useEffect(() => {
    if (!enabled || !selectedThreadId) {
      setActivities([])
      return
    }

    const cached = activityCacheRef.current.get(selectedThreadId)
    if (cached) {
      setActivities(cached)
      return
    }

    setActivities([])
    let cancelled = false
    const fetchActivities = async () => {
      if (!localStorage.getItem('token')) return
      try {
        const acts = await agentsApi.getActivities(selectedThreadId)
        if (!cancelled) {
          const sorted = sortActivities(acts)
          activityCacheRef.current.set(selectedThreadId, sorted)
          setActivities(sorted)
        }
      } catch {
        /* ignore */
      }
    }
    void fetchActivities()
    return () => {
      cancelled = true
    }
  }, [selectedThreadId, enabled])

  // Auto-scroll activities
  useEffect(() => {
    if (!enabled) return
    activityEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activities, enabled])

  // ── Filtered threads for selected repo ─────────────────────────

  const repoThreads = useMemo(
    () =>
      selectedRepo
        ? threads.filter((t) => threadBelongsToRepository(t, selectedRepo))
        : [],
    [threads, selectedRepo],
  )

  const prStateRequestRef = useRef(0)

  useEffect(() => {
    if (!enabled || !selectedRepo) {
      setThreadPrStates({})
      return
    }

    const requestId = ++prStateRequestRef.current
    const repoPath = selectedRepo.localPath
    const currentThreads = repoThreads
    const baseStates = Object.fromEntries(currentThreads.map((t) => [t.id, null])) as Record<string, ThreadPrState>
    const threadsWithBranch = currentThreads.filter((t) => typeof t.branch === 'string' && t.branch.length > 0)

    const loadPrStates = async () => {
      if (threadsWithBranch.length === 0) {
        if (requestId === prStateRequestRef.current) {
          setThreadPrStates(baseStates)
        }
        return
      }

      const settled = await Promise.allSettled(
        threadsWithBranch.map(async (thread) => {
          // Use the thread's worktree directory when available so git
          // status resolves the correct branch (not the main repo's HEAD).
          const statusCwd = thread.workingDirectory ?? repoPath
          const status = await gitApi.status(
            statusCwd,
            thread.branch ?? undefined,
          )
          const prState: ThreadPrState = status.pr?.state ?? null

          // Sync discovered PR metadata back to the thread DB so it
          // persists across sessions and shows in ThreadActions / sidebar.
          if (status.pr && (
            thread.prUrl !== status.pr.url ||
            thread.prState !== status.pr.state ||
            thread.prNumber !== status.pr.number
          )) {
            try {
              await agentsApi.updateThread(thread.id, {
                prUrl: status.pr.url,
                prNumber: status.pr.number,
                prTitle: status.pr.title,
                prState: status.pr.state,
              })
            } catch { /* best-effort sync */ }
          }

          return { threadId: thread.id, prState, ghAvailable: status.ghAvailable }
        }),
      )
      if (requestId !== prStateRequestRef.current) return

      const nextStates = { ...baseStates }
      let anyGhAvailable = false
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          nextStates[result.value.threadId] = result.value.prState
          if (result.value.ghAvailable) anyGhAvailable = true
        }
      }
      setGhAvailable(anyGhAvailable)
      setThreadPrStates(nextStates)
    }

    void loadPrStates()
  }, [enabled, repoThreads, selectedRepo])

  // ── Repository CRUD (API-backed) ────────────────────────────────

  const handleFolderSelected = useCallback(
    async (path: string) => {
      // If repo already exists locally, just select it
      const existing = localRepositories.find((r) => r.localPath === path)
      if (existing) {
        setSelectedRepoId(existing.id)
        return
      }

      let branch = 'main'
      try {
        const status = await gitApi.status(path)
        if (status.branch) branch = status.branch
      } catch {
        /* fall back to 'main' */
      }

      try {
        const created = await agentsApi.createRepo({
          name: folderName(path),
          defaultBranch: branch,
          localPath: path,
          deviceId: localDeviceId,
        })
        // Optimistically add; WS event will deduplicate
        const repo = dbRepoToLocal(created, localDeviceId)
        setLocalRepositories((prev) => {
          if (prev.some(r => r.id === repo.id)) return prev
          return [repo, ...prev]
        })
        setSelectedRepoId(repo.id)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create repository')
      }
    },
    [localRepositories],
  )

  const removeRepository = useCallback(
    async (id: string) => {
      try {
        await agentsApi.deleteRepo(id)
      } catch {
        /* best-effort — WS event will sync */
      }
      setLocalRepositories((prev) => prev.filter((r) => r.id !== id))
      if (selectedRepoId === id) setSelectedRepoId(null)
    },
    [selectedRepoId],
  )

  // ── Thread lifecycle ───────────────────────────────────────────

  const handleSend = useCallback(
    async (text: string, providerId: ProviderId = 'jait', model?: string | null) => {
      if (!text.trim()) return

      if (selectedThread && (selectedThread.status === 'running' || selectedThread.providerSessionId)) {
        // Follow-up turn — session is still alive
        await agentsApi.sendTurn(selectedThread.id, text)
        void refresh()
      } else if (
        selectedThread &&
        (selectedThread.status === 'completed' ||
          selectedThread.status === 'error' ||
          selectedThread.status === 'interrupted')
      ) {
        // Re-start the existing thread (worktree is still available)
        const updated = await agentsApi.startThread(selectedThread.id, text)
        // Immediately reflect the running status without waiting for WS
        setThreads(prev => prev.map(t => t.id === updated.id ? updated : t))
        void refresh()
      } else {
        if (!selectedRepo) return
        if (selectedRepo.source !== 'local') {
          setError('Add this repository locally on this device to start a new thread. Existing threads stay shared across clients.')
          return
        }

        // Deselect so the user gets a fresh input immediately
        setSelectedThreadId(null)

        // Capture repo values before going async (avoid stale closure)
        const repo = selectedRepo

        // Fire-and-forget: create worktree → thread → start → title in background.
        // The thread appears in the sidebar via WS `thread.created` event,
        // and the title updates via WS `thread.updated` once generated.
        void (async () => {
          try {
            const branchName = generateBranchName()
            let worktreePath: string | undefined
            try {
              const wt = await gitApi.createWorktree(
                repo.localPath,
                repo.defaultBranch,
                branchName,
              )
              worktreePath = wt.path
            } catch {
              // Worktree creation failed — fall back to branch in-place
              try {
                await gitApi.createBranch(repo.localPath, branchName, repo.defaultBranch)
              } catch { /* ignore */ }
            }

            const thread = await agentsApi.createThread({
              title: `[${repo.name}] Generating title…`,
              providerId,
              ...(model ? { model } : {}),
              workingDirectory: worktreePath ?? repo.localPath,
              branch: branchName,
            })
            await agentsApi.startThread(thread.id, {
              message: text,
              titleTask: text,
              titlePrefix: `[${repo.name}] `,
            })
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create thread')
          }
        })()
      }
    },
    [selectedRepo, selectedThread, refresh],
  )

  const handleStop = useCallback(
    async (id: string) => {
      try {
        await agentsApi.stopThread(id)
        void refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to stop thread')
      }
    },
    [refresh],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await agentsApi.deleteThread(id)
        setThreads((prev) => prev.filter((t) => t.id !== id))
        if (selectedThreadId === id) setSelectedThreadId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete thread')
      }
    },
    [selectedThreadId],
  )

  return {
    // Repos
    repositories,
    selectedRepoId,
    setSelectedRepoId,
    selectedRepo,
    folderPickerOpen,
    setFolderPickerOpen,
    handleFolderSelected,
    removeRepository,

    // Threads
    threads,
    repoThreads,
    selectedThreadId,
    setSelectedThreadId,
    selectedThread,
    getRepositoryForThread,
    threadPrStates,
    ghAvailable,
    activities,
    activityEndRef,
    providers,
    loading,
    error,
    setError,
    creating: false as const,
    showGitActions,

    // Actions
    refresh,
    handleSend,
    handleStop,
    handleDelete,

    // WS event handler
    handleThreadEvent,
  }
}
