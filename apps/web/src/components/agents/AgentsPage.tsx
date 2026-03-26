/**
 * AgentsPage — Parallel agent threads UI (t3code-inspired).
 *
 * Left sidebar: list of threads with status pills and quick actions.
 * Right panel: selected thread detail with activity feed, prompt input, and controls.
 * Replaces the old AutomationPage with a much simpler model.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
// Card components available if needed
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
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
} from 'lucide-react'
import {
  agentsApi,
  type AgentThread,
  type ThreadActivity,
  type ProviderInfo,
  type ProviderId,
} from '@/lib/agents-api'
import { canStopThread } from '@/lib/thread-status'

// ── Status helpers ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Circle }> = {
  running: { label: 'Running', color: 'bg-green-500 animate-pulse', icon: Loader2 },
  completed: { label: 'Done', color: 'bg-blue-500', icon: CheckCircle2 },
  error: { label: 'Error', color: 'bg-red-500', icon: XCircle },
  interrupted: { label: 'Stopped', color: 'bg-yellow-500', icon: Pause },
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.completed
  const Icon = cfg.icon
  return (
    <Badge variant="outline" className="flex items-center gap-1 text-xs px-1.5 py-0.5">
      <span className={`w-2 h-2 rounded-full ${cfg.color}`} />
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  )
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  jait: 'Jait',
  codex: 'Codex',
  'claude-code': 'Claude Code',
  gemini: 'Gemini CLI',
  opencode: 'OpenCode',
  copilot: 'Copilot',
}

function getThreadCapableProviders(providers: ProviderInfo[]) {
  return providers.filter((provider) => provider.id !== 'jait')
}

// ── Main component ───────────────────────────────────────────────────

export function AgentsPage() {
  const [threads, setThreads] = useState<AgentThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activities, setActivities] = useState<ThreadActivity[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New thread form
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newProvider, setNewProvider] = useState<ProviderId>('codex')
  const [newPrompt, setNewPrompt] = useState('')

  // Send message
  const [sendMessage, setSendMessage] = useState('')
  const activityEndRef = useRef<HTMLDivElement>(null)

  const selected = threads.find((t) => t.id === selectedId)

  // ── Data fetching ──────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const [threadList, providerResult] = await Promise.all([
        agentsApi.listThreads(),
        agentsApi.listProviders().catch(() => ({ providers: [], remoteProviders: [] })),
      ])
      setThreads(threadList)
      setProviders(providerResult.providers)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 3000) // Poll for status changes
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    const threadProviders = getThreadCapableProviders(providers)
    if (threadProviders.length === 0) return
    if (!threadProviders.some((provider) => provider.id === newProvider)) {
      setNewProvider(threadProviders[0]!.id)
    }
  }, [newProvider, providers])

  const threadProviders = getThreadCapableProviders(providers)

  // Fetch activities when selection changes
  useEffect(() => {
    if (!selectedId) {
      setActivities([])
      setLoadingActivities(false)
      return
    }
    let cancelled = false
    setLoadingActivities(true)
    const fetchActivities = async () => {
      try {
        const acts = await agentsApi.getActivities(selectedId)
        if (!cancelled) setActivities(acts)
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoadingActivities(false)
      }
    }
    fetchActivities()
    const interval = setInterval(fetchActivities, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [selectedId])

  // Scroll to bottom of activity feed
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activities.length])

  // ── Actions ────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    try {
      const thread = await agentsApi.createThread({
        title: newTitle,
        providerId: newProvider,
        kind: 'delivery',
      })
      setThreads((prev) => [thread, ...prev])
      setSelectedId(thread.id)
      setNewTitle('')
      setShowNew(false)

      // If a prompt was provided, start immediately
      if (newPrompt.trim()) {
        await agentsApi.startThread(thread.id, newPrompt)
        setNewPrompt('')
        refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create thread')
    }
  }

  const handleStart = async (id: string, message?: string) => {
    try {
      await agentsApi.startThread(id, message)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start thread')
    }
  }

  const handleStop = async (id: string) => {
    try {
      await agentsApi.stopThread(id)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop thread')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await agentsApi.deleteThread(id)
      setThreads((prev) => prev.filter((t) => t.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete thread')
    }
  }

  const handleSend = async () => {
    if (!selectedId || !sendMessage.trim()) return
    try {
      await agentsApi.sendTurn(selectedId, sendMessage)
      setSendMessage('')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* ── Left sidebar: Thread list ────────────────────────────── */}
      <div className="w-72 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Bot className="w-4 h-4" />
            Agents
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowNew(!showNew)}
            title="New thread"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* New thread form */}
        {showNew && (
          <div className="p-3 border-b space-y-2">
            <Input
              placeholder="Thread title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
            <Select value={newProvider} onValueChange={(v) => setNewProvider(v as ProviderId)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {threadProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={!p.available}>
                    {p.name} {!p.available && '(unavailable)'}
                  </SelectItem>
                ))}
                {threadProviders.length === 0 && (
                  <>
                    <SelectItem value="codex">Codex</SelectItem>
                    <SelectItem value="claude-code">Claude Code</SelectItem>
                    <SelectItem value="gemini">Gemini CLI</SelectItem>
                    <SelectItem value="opencode">OpenCode</SelectItem>
                    <SelectItem value="copilot">Copilot</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Initial prompt (optional)..."
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              className="text-sm min-h-[60px]"
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={!newTitle.trim()} className="flex-1">
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Thread list */}
        <ScrollArea className="flex-1">
          {threads.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No agent threads yet.
              <br />
              Click + to create one.
            </div>
          ) : (
            <div className="p-1">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedId(thread.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedId === thread.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{thread.title}</span>
                    <StatusPill status={thread.status} />
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                    <span>{PROVIDER_LABELS[thread.providerId] ?? thread.providerId}</span>
                    {thread.model && <span>· {thread.model}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Refresh */}
        <div className="p-2 border-t">
          <Button size="sm" variant="ghost" className="w-full" onClick={refresh}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Right panel: Thread detail ───────────────────────────── */}
      <div className="flex-1 flex flex-col">
        {error && (
          <div className="p-2 bg-destructive/10 text-destructive text-sm border-b">
            {error}
            <Button size="sm" variant="ghost" className="ml-2" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a thread or create a new one
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">{selected.title}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{PROVIDER_LABELS[selected.providerId]}</span>
                  {selected.model && <span>· {selected.model}</span>}
                  <span>· {selected.kind === 'delegation' ? 'delegate' : 'delivery'}</span>
                  {selected.workingDirectory && <span>· {selected.workingDirectory}</span>}
                  {selected.branch && <span>· branch: {selected.branch}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={selected.status} />
                {selected.providerSessionId && selected.status !== 'running' && (
                  <Button
                    size="sm"
                    onClick={() => handleStart(selected.id)}
                    className="gap-1"
                  >
                    <Play className="w-3 h-3" /> Resume
                  </Button>
                )}
                {canStopThread(selected) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleStop(selected.id)}
                    className="gap-1"
                  >
                    <Square className="w-3 h-3" /> {selected.kind === 'delegation' ? 'End helper' : 'Stop'}
                  </Button>
                )}
                {(selected.status === 'completed' || selected.status === 'error' || selected.status === 'interrupted') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStart(selected.id)}
                    className="gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Restart
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(selected.id)}
                  className="text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Error banner */}
            {selected.error && (
              <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">
                {selected.error}
              </div>
            )}

            {/* Activity feed */}
            <ScrollArea className="flex-1 p-4">
              {loadingActivities && activities.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : activities.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No activity yet. Start the thread to begin.
                </div>
              ) : (
                <div className="space-y-2">
                  {activities
                    .slice()
                    .reverse()
                    .map((act) => (
                      <ActivityItem key={act.id} activity={act} />
                    ))}
                  <div ref={activityEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Prompt input (for threads with a live session) */}
            {(selected.status === 'running' || selected.providerSessionId) && (
              <div className="p-3 border-t flex gap-2">
                <Input
                  placeholder="Send a follow-up message..."
                  value={sendMessage}
                  onChange={(e) => setSendMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  className="flex-1"
                />
                <Button onClick={handleSend} disabled={!sendMessage.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Quick start (for completed threads without a session) */}
            {!selected.providerSessionId && selected.status !== 'running' && (
              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter a prompt and start the agent..."
                    value={sendMessage}
                    onChange={(e) => setSendMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleStart(selected.id, sendMessage)
                        setSendMessage('')
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => {
                      handleStart(selected.id, sendMessage)
                      setSendMessage('')
                    }}
                    className="gap-1"
                  >
                    <Play className="w-4 h-4" /> Run
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Activity item sub-component ──────────────────────────────────────

function ActivityItem({ activity }: { activity: ThreadActivity }) {
  const kindColors: Record<string, string> = {
    'tool.start': 'text-blue-600 dark:text-blue-400',
    'tool.result': 'text-green-600 dark:text-green-400',
    'tool.error': 'text-red-600 dark:text-red-400',
    'tool.approval': 'text-yellow-600 dark:text-yellow-400',
    message: 'text-foreground',
    error: 'text-red-600 dark:text-red-400',
    session: 'text-muted-foreground',
    activity: 'text-muted-foreground',
  }

  const color = kindColors[activity.kind] ?? 'text-muted-foreground'
  const time = new Date(activity.createdAt).toLocaleTimeString()

  return (
    <div className={`text-sm ${color} flex gap-2`}>
      <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">{time}</span>
      <div className="flex-1 min-w-0">
        <span className="font-mono text-xs opacity-60">[{activity.kind}]</span>{' '}
        <span className="break-words">{activity.summary}</span>
      </div>
    </div>
  )
}
