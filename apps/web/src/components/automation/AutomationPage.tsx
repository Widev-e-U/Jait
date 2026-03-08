/**
 * AutomationPage — Parallel automation UI (t3code-inspired).
 *
 * Left panel: registered repositories with git status + quick actions.
 * Right panel: agent threads running in parallel on those repos with
 * input/activity feed + full commit/push/PR flow from t3code.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
// import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus,
  Play,
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
  GitBranch,
  FolderOpen,
  AlertCircle,
} from 'lucide-react'
import {
  agentsApi,
  type AgentThread,
  type ThreadActivity,
  type ProviderInfo,
  type ProviderId,
} from '@/lib/agents-api'
import { GitActionsControl } from './GitActionsControl'

// ── Types ────────────────────────────────────────────────────────────

type GitProvider = 'github' | 'gitea' | 'gitlab' | 'azure-devops' | 'bitbucket' | 'other'

interface RepositoryConnection {
  id: string
  name: string
  provider: GitProvider
  cloneUrl: string
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

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle
  const Icon = cfg.icon
  return (
    <Badge variant="outline" className="flex items-center gap-1 text-xs px-1.5 py-0.5">
      <span className={`w-2 h-2 rounded-full ${cfg.color}`} />
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  )
}

function providerLabel(provider: GitProvider): string {
  switch (provider) {
    case 'azure-devops':
      return 'Azure DevOps'
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1)
  }
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
  const [showAddRepo, setShowAddRepo] = useState(false)
  const [repoName, setRepoName] = useState('')
  const [repoProvider, setRepoProvider] = useState<GitProvider>('github')
  const [repoUrl, setRepoUrl] = useState('')
  const [repoDefaultBranch, setRepoDefaultBranch] = useState('main')
  const [repoLocalPath, setRepoLocalPath] = useState('')

  // Threads
  const [threads, setThreads] = useState<AgentThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [activities, setActivities] = useState<ThreadActivity[]>([])
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New thread form
  const [showNewThread, setShowNewThread] = useState(false)
  const [newThreadTitle, setNewThreadTitle] = useState('')
  const [newThreadProvider, setNewThreadProvider] = useState<ProviderId>('jait')
  const [newThreadPrompt, setNewThreadPrompt] = useState('')

  // Send message
  const [sendMessage, setSendMessage] = useState('')
  const activityEndRef = useRef<HTMLDivElement>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState<'threads' | 'git'>('threads')

  const selectedRepo = useMemo(
    () => repositories.find((r) => r.id === selectedRepoId) ?? null,
    [repositories, selectedRepoId],
  )
  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
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
        ? threads.filter((t) => {
            // Match threads whose title starts with the repo name or working directory matches
            return (
              t.workingDirectory === selectedRepo.localPath ||
              t.title.startsWith(`[${selectedRepo.name}]`)
            )
          })
        : [],
    [threads, selectedRepo],
  )

  // ── Repository CRUD ────────────────────────────────────────────────

  const addRepository = useCallback(() => {
    if (!repoName.trim() || !repoLocalPath.trim()) {
      setError('Repository name and local path are required.')
      return
    }
    const repo: RepositoryConnection = {
      id: crypto.randomUUID(),
      name: repoName.trim(),
      provider: repoProvider,
      cloneUrl: repoUrl.trim(),
      defaultBranch: repoDefaultBranch.trim() || 'main',
      localPath: repoLocalPath.trim(),
    }
    setRepositories((prev) => [repo, ...prev])
    setRepoName('')
    setRepoUrl('')
    setRepoDefaultBranch('main')
    setRepoLocalPath('')
    setShowAddRepo(false)
    setError(null)
  }, [repoName, repoProvider, repoUrl, repoDefaultBranch, repoLocalPath])

  const removeRepository = useCallback((id: string) => {
    setRepositories((prev) => prev.filter((r) => r.id !== id))
    if (selectedRepoId === id) setSelectedRepoId(null)
  }, [selectedRepoId])

  // ── Thread CRUD ────────────────────────────────────────────────────

  const handleCreateThread = useCallback(async () => {
    if (!newThreadTitle.trim() || !selectedRepo) return
    try {
      const thread = await agentsApi.createThread({
        title: `[${selectedRepo.name}] ${newThreadTitle.trim()}`,
        providerId: newThreadProvider,
        workingDirectory: selectedRepo.localPath,
        branch: selectedRepo.defaultBranch,
      })
      setThreads((prev) => [thread, ...prev])
      setSelectedThreadId(thread.id)
      setNewThreadTitle('')
      setNewThreadPrompt('')
      setShowNewThread(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create thread')
    }
  }, [newThreadTitle, newThreadProvider, newThreadPrompt, selectedRepo])

  const handleStart = useCallback(
    async (id: string) => {
      try {
        await agentsApi.startThread(id)
        void refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start thread')
      }
    },
    [refresh],
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

  const handleSend = useCallback(async () => {
    if (!sendMessage.trim() || !selectedThreadId) return
    try {
      await agentsApi.sendTurn(selectedThreadId, sendMessage.trim())
      setSendMessage('')
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    }
  }, [sendMessage, selectedThreadId, refresh])

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* ─── Left sidebar: repos + threads ─── */}
      <div className="w-80 border-r flex flex-col bg-background">
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

        {/* Repositories section */}
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Repositories</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAddRepo(!showAddRepo)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {showAddRepo && (
            <div className="space-y-2 p-2 rounded-md border bg-muted/50">
              <Input placeholder="Name" value={repoName} onChange={(e) => setRepoName(e.target.value)} className="h-7 text-xs" />
              <Input placeholder="Local path (e.g. /home/user/project)" value={repoLocalPath} onChange={(e) => setRepoLocalPath(e.target.value)} className="h-7 text-xs" />
              <Input placeholder="Clone URL (optional)" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} className="h-7 text-xs" />
              <div className="flex gap-2">
                <Select value={repoProvider} onValueChange={(v) => setRepoProvider(v as GitProvider)}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">GitHub</SelectItem>
                    <SelectItem value="gitea">Gitea</SelectItem>
                    <SelectItem value="gitlab">GitLab</SelectItem>
                    <SelectItem value="azure-devops">Azure DevOps</SelectItem>
                    <SelectItem value="bitbucket">Bitbucket</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Branch" value={repoDefaultBranch} onChange={(e) => setRepoDefaultBranch(e.target.value)} className="h-7 text-xs w-24" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs flex-1" onClick={addRepository}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddRepo(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {repositories.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No repositories registered.</p>
          ) : (
            <div className="space-y-1">
              {repositories.map((repo) => (
                <div
                  key={repo.id}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-accent ${
                    selectedRepoId === repo.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedRepoId(repo.id)}
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{repo.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{repo.localPath}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    {providerLabel(repo.provider)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
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

        {/* Threads section */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Threads {selectedRepo ? `— ${selectedRepo.name}` : ''}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={!selectedRepo}
              onClick={() => setShowNewThread(!showNewThread)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {showNewThread && selectedRepo && (
            <div className="p-3 border-b space-y-2 bg-muted/50">
              <Input
                placeholder="Thread title"
                value={newThreadTitle}
                onChange={(e) => setNewThreadTitle(e.target.value)}
                className="h-7 text-xs"
              />
              <Select value={newThreadProvider} onValueChange={(v) => setNewThreadProvider(v as ProviderId)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {PROVIDER_LABELS[p.id] ?? p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="System prompt (optional)"
                value={newThreadPrompt}
                onChange={(e) => setNewThreadPrompt(e.target.value)}
                rows={2}
                className="text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs flex-1" onClick={() => void handleCreateThread()}>
                  Create
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNewThread(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : repoThreads.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">
                {selectedRepo ? 'No threads for this repo.' : 'Select a repository first.'}
              </p>
            ) : (
              <div className="p-1 space-y-0.5">
                {repoThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-accent ${
                      selectedThreadId === thread.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => setSelectedThreadId(thread.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{thread.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {PROVIDER_LABELS[thread.providerId as ProviderId] ?? thread.providerId}
                      </p>
                    </div>
                    <StatusPill status={thread.status} />
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* ─── Right panel: thread detail / git ─── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Tab bar */}
        <div className="border-b flex">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'threads'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('threads')}
          >
            Threads
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'git'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('git')}
            disabled={!selectedRepo}
          >
            <GitBranch className="h-3.5 w-3.5 inline mr-1" />
            Git &amp; PR
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3">
            <AlertCircle className="h-4 w-4" />
            {error}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {activeTab === 'threads' && (
          <div className="flex-1 flex flex-col min-h-0">
            {selectedThread ? (
              <>
                {/* Thread header */}
                <div className="p-3 border-b flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate">{selectedThread.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {PROVIDER_LABELS[selectedThread.providerId as ProviderId] ?? selectedThread.providerId}
                    </p>
                  </div>
                  <StatusPill status={selectedThread.status} />
                  <div className="flex gap-1">
                    {selectedThread.status !== 'running' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void handleStart(selectedThread.id)}>
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {selectedThread.status === 'running' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void handleStop(selectedThread.id)}>
                        <Square className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => void handleDelete(selectedThread.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Activity feed */}
                <ScrollArea className="flex-1 p-3">
                  {activities.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No activity yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {activities.map((act) => (
                        <ActivityItem key={act.id} activity={act} />
                      ))}
                      <div ref={activityEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Send message */}
                <div className="p-3 border-t flex gap-2">
                  <Input
                    placeholder="Send a message..."
                    value={sendMessage}
                    onChange={(e) => setSendMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void handleSend()}
                    className="flex-1 h-8 text-sm"
                  />
                  <Button size="sm" className="h-8" onClick={() => void handleSend()} disabled={!sendMessage.trim()}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                {selectedRepo ? 'Select or create a thread to get started.' : 'Select a repository from the sidebar.'}
              </div>
            )}
          </div>
        )}

        {activeTab === 'git' && selectedRepo && (
          <div className="flex-1 overflow-auto p-4">
            <GitActionsControl cwd={selectedRepo.localPath} pollInterval={5_000} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function ActivityItem({ activity }: { activity: ThreadActivity }) {
  return (
    <div className="rounded-md border p-2 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-medium">{activity.kind}</span>
        <span className="text-muted-foreground">{new Date(activity.createdAt).toLocaleTimeString()}</span>
      </div>
      {activity.summary && <pre className="whitespace-pre-wrap text-muted-foreground">{activity.summary}</pre>}
    </div>
  )
}
