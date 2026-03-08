/**
 * AutomationPage — Centered chat-style UI with sidebar for repos & threads.
 *
 * Left panel: registered repositories and their threads (compact).
 * Center: chat input (t3code-inspired). Typing a message auto-creates a
 * thread on a new feature branch, starts the provider, and sends the first
 * turn — no naming needed. After the agent completes, a git quick-action
 * button in the header lets you commit, push & create a PR in one click.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus,
  Square,
  Trash2,
  Send,
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Pause,
  RefreshCw,
  FolderOpen,
  AlertCircle,
  MessageSquare,
} from 'lucide-react'
import {
  agentsApi,
  type AgentThread,
  type ThreadActivity,
  type ProviderInfo,
  type ProviderId,
} from '@/lib/agents-api'
import { gitApi } from '@/lib/git-api'
import { FolderPickerDialog } from '@/components/workspace/folder-picker-dialog'
import { ThreadActions } from './ThreadActions'

// ── Types ────────────────────────────────────────────────────────────

interface RepositoryConnection {
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

// ── Status helpers ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Circle }> = {
  idle: { label: 'Idle', color: 'bg-gray-400', icon: Circle },
  running: { label: 'Running', color: 'bg-green-500 animate-pulse', icon: Loader2 },
  completed: { label: 'Done', color: 'bg-blue-500', icon: CheckCircle2 },
  error: { label: 'Error', color: 'bg-red-500', icon: XCircle },
  interrupted: { label: 'Stopped', color: 'bg-yellow-500', icon: Pause },
}

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle
  return <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.color}`} title={cfg.label} />
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

const PROVIDER_LABELS: Record<ProviderId, string> = {
  jait: 'Jait',
  codex: 'Codex',
  'claude-code': 'Claude Code',
}

// ── Main component ───────────────────────────────────────────────────

export function AutomationPage() {
  // Repositories
  const [repositories, setRepositories] = useState<RepositoryConnection[]>(loadRepos)
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)

  // Threads
  const [threads, setThreads] = useState<AgentThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [activities, setActivities] = useState<ThreadActivity[]>([])
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Chat input
  const [inputMessage, setInputMessage] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('jait')
  const [creating, setCreating] = useState(false)
  const activityEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const selectedRepo = useMemo(
    () => repositories.find((r) => r.id === selectedRepoId) ?? null,
    [repositories, selectedRepoId],
  )
  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  )

  /** Whether the selected thread is done and the git action button should show */
  const showGitActions = useMemo(
    () =>
      selectedThread != null &&
      selectedRepo != null &&
      (selectedThread.status === 'completed' ||
        selectedThread.status === 'error' ||
        selectedThread.status === 'interrupted'),
    [selectedThread, selectedRepo],
  )

  // ── Persistence ──────────────────────────────────────────────────────

  useEffect(() => {
    saveRepos(repositories)
  }, [repositories])

  // Auto-select first repo
  useEffect(() => {
    if (!selectedRepoId && repositories.length > 0) {
      setSelectedRepoId(repositories[0].id)
    }
    if (selectedRepoId && repositories.every((r) => r.id !== selectedRepoId)) {
      setSelectedRepoId(repositories[0]?.id ?? null)
    }
  }, [repositories, selectedRepoId])

  // ── Data fetching ──────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const [ts, ps] = await Promise.all([agentsApi.listThreads(), agentsApi.listProviders()])
      setThreads(ts)
      setProviders(ps)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 5_000)
    return () => clearInterval(id)
  }, [refresh])

  // Fetch activities for selected thread
  useEffect(() => {
    if (!selectedThreadId) {
      setActivities([])
      return
    }
    let cancelled = false
    const fetchActivities = async () => {
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
  }, [selectedThreadId])

  // Auto-scroll activities
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activities])

  // ── Filtered threads for selected repo ─────────────────────────────

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

  // ── Repository CRUD ────────────────────────────────────────────────

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

  // ── Thread lifecycle ───────────────────────────────────────────────

  /**
   * Send a message. If no thread is selected, creates a new feature branch,
   * creates a thread, starts the provider, and sends the first turn.
   */
  const handleSend = useCallback(async () => {
    const text = inputMessage.trim()
    if (!text || !selectedRepo) return

    setCreating(true)
    try {
      if (selectedThread && selectedThread.status === 'running') {
        // Already running — just send a turn
        await agentsApi.sendTurn(selectedThread.id, text)
      } else if (selectedThread && selectedThread.status === 'idle') {
        // Idle thread — start it with this message
        await agentsApi.startThread(selectedThread.id, text)
      } else {
        // No thread or thread is finished — create a new branch + thread
        const branchName = generateBranchName()
        try {
          await gitApi.createBranch(selectedRepo.localPath, branchName, selectedRepo.defaultBranch)
        } catch {
          // If branch creation fails (not a git repo, etc.), continue without it
        }

        const thread = await agentsApi.createThread({
          title: `[${selectedRepo.name}] ${text.slice(0, 60)}`,
          providerId: selectedProvider,
          workingDirectory: selectedRepo.localPath,
          branch: branchName,
        })
        setSelectedThreadId(thread.id)
        // Start and send the initial message
        await agentsApi.startThread(thread.id, text)
      }

      setInputMessage('')
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setCreating(false)
    }
  }, [inputMessage, selectedRepo, selectedThread, selectedProvider, refresh])

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend()
      }
    },
    [handleSend],
  )

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* ─── Left sidebar: repos + threads ─── */}
      <div className="w-72 border-r flex flex-col bg-background">
        {/* Header */}
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Bot className="h-4 w-4" />
            Automations
          </h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Repositories */}
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Repositories
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setFolderPickerOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {repositories.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No repositories yet.</p>
          ) : (
            <div className="space-y-1">
              {repositories.map((repo) => (
                <div
                  key={repo.id}
                  className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-accent ${
                    selectedRepoId === repo.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => {
                    setSelectedRepoId(repo.id)
                    setSelectedThreadId(null)
                  }}
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{repo.name}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    {repo.defaultBranch}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRepository(repo.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Threads for selected repo */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Threads
            </span>
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : repoThreads.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">
                {selectedRepo
                  ? 'Type a message to start a new thread.'
                  : 'Select a repository first.'}
              </p>
            ) : (
              <div className="p-1 space-y-0.5">
                {repoThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-accent ${
                      selectedThreadId === thread.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => setSelectedThreadId(thread.id)}
                  >
                    <StatusDot status={thread.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{thread.title.replace(/^\[.*?\]\s*/, '')}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {PROVIDER_LABELS[thread.providerId as ProviderId] ?? thread.providerId}
                        {thread.branch ? ` · ${thread.branch}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleDelete(thread.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* ─── Main area: centered chat ─── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header bar */}
        {selectedRepo && (
          <div className="border-b flex items-center px-4 py-2 gap-3">
            {/* Thread info */}
            {selectedThread ? (
              <>
                <StatusDot status={selectedThread.status} />
                <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                  {selectedThread.title.replace(/^\[.*?\]\s*/, '')}
                </span>
                {selectedThread.branch && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {selectedThread.branch}
                  </Badge>
                )}
                {selectedThread.status === 'running' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => void handleStop(selectedThread.id)}
                  >
                    <Square className="h-3 w-3" />
                  </Button>
                )}
                {selectedThread.status !== 'running' && selectedThread.status !== 'idle' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setSelectedThreadId(null)}
                  >
                    New
                  </Button>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {selectedRepo.name} · {selectedRepo.defaultBranch}
              </span>
            )}


          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-4 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{error}</span>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {/* No repo selected */}
        {!selectedRepo && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Bot className="h-10 w-10" />
            <p className="text-sm">Add a repository to get started</p>
            <Button variant="outline" size="sm" onClick={() => setFolderPickerOpen(true)}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Add Repository
            </Button>
          </div>
        )}

        {/* Chat area */}
        {selectedRepo && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Activity feed (scrollable middle area) */}
            {selectedThread && activities.length > 0 ? (
              <ScrollArea className="flex-1">
                <div className="mx-auto w-full max-w-3xl px-4 py-4 space-y-3">
                  {activities.map((act) => (
                    <ActivityItem key={act.id} activity={act} />
                  ))}
                  <div ref={activityEndRef} />
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                {selectedThread ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mb-2" />
                    <p className="text-sm">Waiting for activity...</p>
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-8 w-8 mb-3" />
                    <p className="text-sm mb-1">What would you like to work on?</p>
                    <p className="text-xs">
                      Working on{' '}
                      <span className="font-medium text-foreground">{selectedRepo.name}</span>
                      {' · '}
                      a new branch will be created from{' '}
                      <span className="font-mono">{selectedRepo.defaultBranch}</span>
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ─── Bottom-pinned chat input ─── */}
            <div className="border-t bg-background px-4 pt-3 pb-4">
              <div className="mx-auto w-full max-w-3xl">
                <div className="rounded-2xl border bg-card shadow-sm">
                  <Textarea
                    ref={inputRef}
                    placeholder={
                      selectedThread?.status === 'running'
                        ? 'Send a follow-up message...'
                        : 'Describe what you want to do...'
                    }
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={3}
                    className="border-0 bg-transparent resize-none focus-visible:ring-0 text-sm px-4 pt-3 pb-1"
                    disabled={creating}
                  />
                  <div className="flex items-center justify-between px-3 pb-2">
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedProvider}
                        onValueChange={(v) => setSelectedProvider(v as ProviderId)}
                        disabled={!!selectedThread}
                      >
                        <SelectTrigger className="h-7 text-xs w-auto border-0 bg-muted/50 px-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {providers
                            .filter((p) => p.available)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {PROVIDER_LABELS[p.id] ?? p.id}
                              </SelectItem>
                            ))}
                          {providers.filter((p) => p.available).length === 0 && (
                            <SelectItem value="jait">Jait</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => void handleSend()}
                      disabled={!inputMessage.trim() || creating}
                    >
                      {creating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                {showGitActions && selectedRepo && selectedThread && (
                  <ThreadActions
                    cwd={selectedRepo.localPath}
                    branch={selectedThread.branch}
                    baseBranch={selectedRepo.defaultBranch}
                    threadTitle={selectedThread.title}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Folder picker dialog */}
      <FolderPickerDialog
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        onSelect={(path) => void handleFolderSelected(path)}
      />
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function ActivityItem({ activity }: { activity: ThreadActivity }) {
  const isUser = activity.kind === 'user_message'
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        isUser ? 'bg-primary/5 border-primary/20 ml-12' : 'bg-card mr-12'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{activity.kind}</span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(activity.createdAt).toLocaleTimeString()}
        </span>
      </div>
      {activity.summary && (
        <pre className="whitespace-pre-wrap text-sm leading-relaxed">{activity.summary}</pre>
      )}
    </div>
  )
}
