/**
 * useAutomation — hook encapsulating Manager-mode state.
 *
 * Manages repositories (localStorage), threads, activities, and providers
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
} from '@/lib/agents-api'
import { gitApi } from '@/lib/git-api'

// ── Types ────────────────────────────────────────────────────────────

export interface RepositoryConnection {
  id: string
  name: string
  defaultBranch: string
  localPath: string
}

// ── Persistence helpers ──────────────────────────────────────────────

const REPOS_STORAGE_KEY = 'jait_automation_repos'

function loadRepos(): RepositoryConnection[] {
  try {
    const raw = localStorage.getItem(REPOS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as RepositoryConnection[]) : []
  } catch {
    return []
  }
}

function saveRepos(repos: RepositoryConnection[]) {
  localStorage.setItem(REPOS_STORAGE_KEY, JSON.stringify(repos))
}

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

// ── Hook ─────────────────────────────────────────────────────────────

export function useAutomation(enabled = true) {
  // Repositories
  const [repositories, setRepositories] = useState<RepositoryConnection[]>(loadRepos)
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)

  // Threads
  const [threads, setThreads] = useState<AgentThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [activities, setActivities] = useState<ThreadActivity[]>([])
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Send state
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('jait')
  const [creating, setCreating] = useState(false)
  const activityEndRef = useRef<HTMLDivElement | null>(null)

  const selectedRepo = useMemo(
    () => repositories.find((r) => r.id === selectedRepoId) ?? null,
    [repositories, selectedRepoId],
  )
  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  )

  const showGitActions = useMemo(
    () =>
      selectedThread != null &&
      selectedRepo != null &&
      (selectedThread.status === 'completed' ||
        selectedThread.status === 'error' ||
        selectedThread.status === 'interrupted'),
    [selectedThread, selectedRepo],
  )

  // ── Persistence ──────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return
    saveRepos(repositories)
  }, [repositories, enabled])

  // Auto-select first repo
  useEffect(() => {
    if (!enabled) return
    if (!selectedRepoId && repositories.length > 0) {
      setSelectedRepoId(repositories[0].id)
    }
    if (selectedRepoId && repositories.every((r) => r.id !== selectedRepoId)) {
      setSelectedRepoId(repositories[0]?.id ?? null)
    }
  }, [repositories, selectedRepoId, enabled])

  // ── Data fetching ──────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('token')) return // skip when not authenticated
    try {
      const [ts, ps] = await Promise.all([agentsApi.listThreads(), agentsApi.listProviders()])
      setThreads(ts)
      setProviders(ps)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const id = setInterval(() => void refresh(), 5_000)
    return () => clearInterval(id)
  }, [refresh, enabled])

  // Fetch activities for selected thread
  useEffect(() => {
    if (!enabled || !selectedThreadId) {
      setActivities([])
      return
    }
    let cancelled = false
    const fetchActivities = async () => {
      if (!localStorage.getItem('token')) return
      try {
        const acts = await agentsApi.getActivities(selectedThreadId)
        if (!cancelled) setActivities(acts)
      } catch {
        /* ignore */
      }
    }
    void fetchActivities()
    const id = setInterval(() => void fetchActivities(), 3_000)
    return () => {
      cancelled = true
      clearInterval(id)
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
        ? threads.filter(
            (t) =>
              t.workingDirectory === selectedRepo.localPath ||
              t.title.startsWith(`[${selectedRepo.name}]`),
          )
        : [],
    [threads, selectedRepo],
  )

  // ── Repository CRUD ────────────────────────────────────────────

  const handleFolderSelected = useCallback(
    async (path: string) => {
      if (repositories.some((r) => r.localPath === path)) {
        setSelectedRepoId(repositories.find((r) => r.localPath === path)!.id)
        return
      }

      let branch = 'main'
      try {
        const status = await gitApi.status(path)
        if (status.branch) branch = status.branch
      } catch {
        /* fall back to 'main' */
      }

      const repo: RepositoryConnection = {
        id: crypto.randomUUID(),
        name: folderName(path),
        defaultBranch: branch,
        localPath: path,
      }
      setRepositories((prev) => [repo, ...prev])
      setSelectedRepoId(repo.id)
      setError(null)
    },
    [repositories],
  )

  const removeRepository = useCallback(
    (id: string) => {
      setRepositories((prev) => prev.filter((r) => r.id !== id))
      if (selectedRepoId === id) setSelectedRepoId(null)
    },
    [selectedRepoId],
  )

  // ── Thread lifecycle ───────────────────────────────────────────

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || !selectedRepo) return

      setCreating(true)
      try {
        if (selectedThread && selectedThread.status === 'running') {
          await agentsApi.sendTurn(selectedThread.id, text)
        } else if (selectedThread && selectedThread.status === 'idle') {
          await agentsApi.startThread(selectedThread.id, text)
        } else {
          const branchName = generateBranchName()
          try {
            await gitApi.createBranch(selectedRepo.localPath, branchName, selectedRepo.defaultBranch)
          } catch {
            // If branch creation fails, continue without it
          }

          const thread = await agentsApi.createThread({
            title: `[${selectedRepo.name}] ${text.slice(0, 60)}`,
            providerId: selectedProvider,
            workingDirectory: selectedRepo.localPath,
            branch: branchName,
          })
          setSelectedThreadId(thread.id)
          await agentsApi.startThread(thread.id, text)
        }

        void refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
      } finally {
        setCreating(false)
      }
    },
    [selectedRepo, selectedThread, selectedProvider, refresh],
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
    activities,
    activityEndRef,
    providers,
    loading,
    error,
    setError,
    creating,
    showGitActions,

    // Provider
    selectedProvider,
    setSelectedProvider,

    // Actions
    refresh,
    handleSend,
    handleStop,
    handleDelete,
  }
}
