/**
 * useAutomation — hook encapsulating Manager-mode state.
 *
 * Manages repositories (DB-backed via API), threads, activities, and providers
 * for the automation / "Manager" workflow.  Extracted from AutomationPage
 * so it can be used inside the merged Chat view.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { getAuthToken } from '@/lib/auth-token'
import {
  type RemoteProviderInfo,
  agentsApi,
  type AgentThread,
  type ThreadActivity,
  type ThreadMessageMetadata,
  type ProviderInfo,
  type ProviderId,
  type AutomationRepo,
} from '@/lib/agents-api'
import {
  buildRepositoryFallbackUnavailableMessage,
  getRepositoryRuntimeInfo,
  inferSharedRepositories,
  threadBelongsToRepository,
  type AutomationRepository,
} from '@/lib/automation-repositories'
import { gitApi, type GitStatusPr } from '@/lib/git-api'
import { generateDeviceId } from '@/lib/device-id'

// ── Types ────────────────────────────────────────────────────────────

export type RepositoryConnection = AutomationRepository

export type ThreadPrState = GitStatusPr['state'] | 'creating' | null
const THREAD_LIST_LIMIT = 10

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
    githubUrl: repo.githubUrl,
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
  const [threadListLimit, setThreadListLimit] = useState(THREAD_LIST_LIMIT)
  const [hasMoreThreads, setHasMoreThreads] = useState(false)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [activities, setActivities] = useState<ThreadActivity[]>([])
  const [threadPrStates, setThreadPrStates] = useState<Record<string, ThreadPrState>>({})
  const [ghAvailable, setGhAvailable] = useState(true)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [remoteProviders, setRemoteProviders] = useState<RemoteProviderInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [loadingActivities, setLoadingActivities] = useState(false)
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
      selectedThread.kind === 'delivery' &&
      selectedRepo != null &&
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
    if (!getAuthToken()) return // skip when not authenticated
    setLoading(true)
    try {
      const [ts, provResult, repos] = await Promise.all([
        agentsApi.listThreadsPage({ limit: threadListLimit }),
        agentsApi.listProviders(),
        agentsApi.listRepos(),
      ])
      setThreads(ts.threads)
      setHasMoreThreads(ts.hasMore)
      setProviders(provResult.providers)
      setRemoteProviders(provResult.remoteProviders)
      setProvidersLoaded(true)
      setLocalRepositories(repos.map(r => dbRepoToLocal(r, localDeviceId)))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [localDeviceId, threadListLimit])

  /** Lightweight refresh of just providers + repos (used when FsNodes connect/disconnect). */
  const refreshProviders = useCallback(async () => {
    if (!getAuthToken()) return
    try {
      const [provResult, repos] = await Promise.all([
        agentsApi.listProviders(),
        agentsApi.listRepos(),
      ])
      setProviders(provResult.providers)
      setRemoteProviders(provResult.remoteProviders)
      setLocalRepositories(repos.map(r => dbRepoToLocal(r, localDeviceId)))
    } catch { /* best-effort */ }
  }, [localDeviceId])

  const getRuntimeInfoForRepository = useCallback(
    (repository: RepositoryConnection) => getRepositoryRuntimeInfo(repository, {
      localDeviceId,
      localProviders: providers,
      remoteProviders,
      providersLoaded,
    }),
    [localDeviceId, providers, remoteProviders, providersLoaded],
  )

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
        const thread = payload.thread as AgentThread | undefined
        if (threadId && status) {
          setThreads(prev => {
            if (thread) {
              const exists = prev.some(t => t.id === threadId)
              return exists
                ? prev.map(t => t.id === threadId ? thread : t)
                : [thread, ...prev]
            }
            return prev.map(t =>
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
            )
          })
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
      // ── FsNode events — re-fetch providers so online/offline updates ──
      case 'fs.node-registered':
      case 'fs.node-disconnected': {
        void refreshProviders()
        break
      }
    }
  }, [])

  // Fetch activities once when selected thread changes (no polling)
  useEffect(() => {
    if (!enabled || !selectedThreadId) {
      setActivities([])
      setLoadingActivities(false)
      return
    }

    const cached = activityCacheRef.current.get(selectedThreadId)
    if (cached) {
      setActivities(cached)
      setLoadingActivities(false)
      return
    }

    setActivities([])
    setLoadingActivities(true)
    let cancelled = false
    const fetchActivities = async () => {
      if (!getAuthToken()) return
      try {
        const acts = await agentsApi.getActivities(selectedThreadId)
        if (!cancelled) {
          const sorted = sortActivities(acts)
          activityCacheRef.current.set(selectedThreadId, sorted)
          setActivities(sorted)
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingActivities(false)
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
        ? threads
            .filter((t) => threadBelongsToRepository(t, selectedRepo))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        : [],
    [threads, selectedRepo],
  )

  const prStateRequestRef = useRef(0)

  /** Max threads to poll for PR state — keeps FsNode / gh load bounded. */
  const PR_POLL_LIMIT = 10

  useEffect(() => {
    if (!enabled || !selectedRepo) {
      setThreadPrStates({})
      return
    }

    const requestId = ++prStateRequestRef.current
    const repoPath = selectedRepo.localPath
    // Only poll the N most recent threads that have a branch
    const threadsWithBranch = repoThreads
      .filter((t) => t.kind === 'delivery' && typeof t.branch === 'string' && t.branch.length > 0)
      .slice(0, PR_POLL_LIMIT)

    const loadPrStates = async () => {
      if (threadsWithBranch.length === 0) {
        if (requestId === prStateRequestRef.current) {
          setThreadPrStates({})
        }
        return
      }

      // Only poll threads that might have actionable PR state changes:
      // skip threads whose PR is already merged/closed (terminal states).
      const pollable = threadsWithBranch.filter(
        (t) => t.prState !== 'merged' && t.prState !== 'closed',
      )

      // Serialize requests to avoid flooding the FsNode / gh CLI with
      // dozens of parallel git-status + gh-pr-view calls that consume
      // excessive RAM and block the event loop.
      const results: { threadId: string; prState: ThreadPrState; ghAvailable: boolean }[] = []
      for (const thread of pollable) {
        if (requestId !== prStateRequestRef.current) return
        try {
          const statusCwd = thread.workingDirectory ?? repoPath
          const status = await gitApi.status(
            statusCwd,
            thread.branch ?? undefined,
          )
          const prState: ThreadPrState = status.pr?.state ?? (thread.prState === 'creating' ? 'creating' : null)

          // Sync discovered PR metadata back to the thread DB so it
          // persists across sessions and shows in ThreadActions / sidebar.
          // Only sync when gh reports an actual PR — never clear existing
          // PR data based on a missing result, as that races with create-pr
          // and causes the "Open PR" button to flicker back to "Create PR".
          if (status.ghAvailable && status.pr && (
            thread.prUrl !== status.pr.url ||
            thread.prState !== status.pr.state ||
            thread.prNumber !== status.pr.number
          )) {
            try {
              await agentsApi.updateThread(thread.id, {
                prUrl: status.pr.url,
                prNumber: status.pr.number,
                prTitle: status.pr.title ?? null,
                prState: status.pr.state,
              })
            } catch { /* best-effort sync */ }
          }

          results.push({ threadId: thread.id, prState, ghAvailable: status.ghAvailable })
        } catch {
          // Skip failed threads — don't mask the DB value
        }
      }
      if (requestId !== prStateRequestRef.current) return

      const nextStates: Record<string, ThreadPrState> = {}
      let anyGhAvailable = false
      for (const r of results) {
        nextStates[r.threadId] = r.prState
        if (r.ghAvailable) anyGhAvailable = true
      }
      // Preserve terminal states for threads we didn't poll
      for (const thread of threadsWithBranch) {
        if (!(thread.id in nextStates) && (thread.prState === 'merged' || thread.prState === 'closed')) {
          nextStates[thread.id] = thread.prState as ThreadPrState
        }
      }
      setGhAvailable(anyGhAvailable)
      setThreadPrStates(nextStates)
    }

    void loadPrStates()

    // Re-check PR states periodically so merged/closed PRs get picked up
    const interval = setInterval(() => {
      if (prStateRequestRef.current === requestId) void loadPrStates()
    }, 60_000)
    return () => clearInterval(interval)
  }, [enabled, repoThreads, selectedRepo])

  // ── Repository CRUD (API-backed) ────────────────────────────────

  const handleFolderSelected = useCallback(
    async (path: string, nodeId?: string) => {
      // Determine the device ID based on the node that hosts the path.
      // 'gateway' or undefined means the repo lives on the gateway server.
      const repoDeviceId = nodeId && nodeId !== 'gateway' ? nodeId : undefined

      // If repo already exists locally, just select it
      const existing = localRepositories.find((r) => r.localPath === path)
      if (existing) {
        setSelectedRepoId(existing.id)
        // Update the repo's device ownership and fill in missing githubUrl
        const updates: Record<string, string> = {}
        const expectedDeviceId = repoDeviceId ?? ''
        if ((existing.deviceId ?? '') !== expectedDeviceId) {
          updates.deviceId = expectedDeviceId
        }
        if (!existing.githubUrl) {
          try {
            const status = await gitApi.status(path)
            if (status.remoteUrl) updates.githubUrl = status.remoteUrl
          } catch { /* ignore */ }
        }
        if (Object.keys(updates).length > 0) {
          try {
            await agentsApi.updateRepo(existing.id, updates)
          } catch { /* best-effort */ }
        }
        return
      }

      let branch = 'main'
      let githubUrl: string | undefined
      try {
        const status = await gitApi.status(path)
        if (status.branch) branch = status.branch
        if (status.remoteUrl) githubUrl = status.remoteUrl
      } catch {
        /* fall back to 'main' */
      }

      try {
        const created = await agentsApi.createRepo({
          name: folderName(path),
          defaultBranch: branch,
          localPath: path,
          deviceId: repoDeviceId,
          githubUrl,
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

  const sendThreadMessage = useCallback(
    async (
      threadId: string | null,
      text: string,
      providerId: ProviderId = 'jait',
      model?: string | null,
      metadata: ThreadMessageMetadata = {},
    ) => {
      if (!text.trim()) return
      const targetThread = threadId
        ? threads.find((thread) => thread.id === threadId) ?? null
        : selectedThread
      const targetRepo = targetThread ? getRepositoryForThread(targetThread) : selectedRepo

      if (targetThread && (targetThread.status === 'running' || targetThread.providerSessionId)) {
        // Follow-up turn — session is still alive
        await agentsApi.sendTurn(targetThread.id, {
          message: text,
          ...metadata,
        })
        void refresh()
      } else if (
        targetThread &&
        (targetThread.status === 'completed' ||
          targetThread.status === 'error' ||
          targetThread.status === 'interrupted')
      ) {
        // Re-start the existing thread (worktree is still available)
        try {
          const updated = await agentsApi.startThread(targetThread.id, {
            message: text,
            ...metadata,
          })
          setThreads(prev => prev.map(t => t.id === updated.id ? updated : t))
          void refresh()
        } catch (startErr) {
          const code = (startErr as Error & { code?: string }).code
          if (code === 'NODE_OFFLINE' && targetRepo) {
            const githubUrl = (targetRepo as { githubUrl?: string | null }).githubUrl
            if (githubUrl && confirm(
              'The desktop app is not connected. Clone the repo to the gateway and run the thread there?',
            )) {
              const updated = await agentsApi.startThread(targetThread.id, {
                message: text,
                cloneToGateway: true,
                repoUrl: githubUrl,
                ...metadata,
              })
              setThreads(prev => prev.map(t => t.id === updated.id ? updated : t))
              void refresh()
            } else if (!githubUrl) {
              setError(buildRepositoryFallbackUnavailableMessage(targetRepo, getRuntimeInfoForRepository(targetRepo)))
            }
          } else {
            throw startErr
          }
        }
      } else {
        if (!targetRepo) return

        // Deselect so the user gets a fresh input immediately
        if (!threadId) {
          setSelectedThreadId(null)
        }

        // Capture repo values before going async (avoid stale closure)
        const repo = targetRepo

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
              kind: 'delivery',
              workingDirectory: worktreePath ?? repo.localPath,
              branch: branchName,
            })
            try {
              await agentsApi.startThread(thread.id, {
                message: text,
                titleTask: metadata.displayContent?.trim() || text,
                titlePrefix: `[${repo.name}] `,
                ...metadata,
              })
            } catch (startErr) {
              // If the desktop app is offline, offer to clone the repo to the gateway
              const code = (startErr as Error & { code?: string }).code
              if (code === 'NODE_OFFLINE') {
                const githubUrl = (repo as { githubUrl?: string | null }).githubUrl
                if (githubUrl && confirm(
                  'The desktop app is not connected. Clone the repo to the gateway and run the thread there?',
                )) {
                  await agentsApi.startThread(thread.id, {
                    message: text,
                    titleTask: metadata.displayContent?.trim() || text,
                    titlePrefix: `[${repo.name}] `,
                    cloneToGateway: true,
                    repoUrl: githubUrl,
                    ...metadata,
                  })
                } else if (!githubUrl) {
                  setError(buildRepositoryFallbackUnavailableMessage(repo, getRuntimeInfoForRepository(repo)))
                }
                // If user cancelled the confirm, just leave the thread idle
                return
              }
              throw startErr
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create thread')
          }
        })()
      }
    },
    [getRuntimeInfoForRepository, getRepositoryForThread, refresh, selectedRepo, selectedThread, threads],
  )

  const handleSend = useCallback(
    async (text: string, providerId: ProviderId = 'jait', model?: string | null, metadata?: ThreadMessageMetadata) => {
      await sendThreadMessage(selectedThread?.id ?? null, text, providerId, model, metadata)
    },
    [selectedThread?.id, sendThreadMessage],
  )

  const handleSendToThread = useCallback(
    async (threadId: string, text: string, providerId: ProviderId = 'jait', model?: string | null, metadata?: ThreadMessageMetadata) => {
      await sendThreadMessage(threadId, text, providerId, model, metadata)
    },
    [sendThreadMessage],
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

  const showMoreThreads = useCallback(() => {
    setThreadListLimit((prev) => prev + THREAD_LIST_LIMIT)
  }, [])

  const showFewerThreads = useCallback(() => {
    setThreadListLimit(THREAD_LIST_LIMIT)
  }, [])

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
    hasMoreThreads,
    threadListLimit,
    showMoreThreads,
    showFewerThreads,
    repoThreads,
    selectedThreadId,
    setSelectedThreadId,
    selectedThread,
    getRepositoryForThread,
    threadPrStates,
    ghAvailable,
    activities,
    loadingActivities,
    activityEndRef,
    providers,
    remoteProviders,
    loading,
    error,
    setError,
    creating: false as const,
    showGitActions,
    getRuntimeInfoForRepository,

    // Actions
    refresh,
    handleSend,
    handleSendToThread,
    handleStop,
    handleDelete,

    // WS event handler
    handleThreadEvent,
  }
}
