import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Archive, Brain, CheckCircle2, Clock3, Loader2, MessageSquare, Plus, RefreshCw, Trash2, Workflow } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { agentsApi, type ReminderRecord, type ReminderSnapshot } from '@/lib/agents-api'
import { cn } from '@/lib/utils'

type ReminderStatusFilter = 'active' | 'archived' | 'all'

function parseTags(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean)
  }
}

function normalizeTags(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'No activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function MemoryPage() {
  const [snapshot, setSnapshot] = useState<ReminderSnapshot | null>(null)
  const [statusFilter, setStatusFilter] = useState<ReminderStatusFilter>('active')
  const [workspaceFilter, setWorkspaceFilter] = useState('all')
  const [newContent, setNewContent] = useState('')
  const [newTags, setNewTags] = useState('')
  const [newWorkspaceId, setNewWorkspaceId] = useState('none')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setSnapshot(await agentsApi.getRemindersSnapshot({ status: statusFilter, limit: 200 }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  const workspaces = snapshot?.workspaces ?? []
  const reminders = useMemo(() => {
    const all = snapshot?.reminders ?? []
    return workspaceFilter === 'all'
      ? all
      : all.filter((reminder) => reminder.workspaceId === workspaceFilter)
  }, [snapshot?.reminders, workspaceFilter])
  const threads = snapshot?.threads ?? []

  const workspaceById = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace])), [workspaces])
  const sessionsById = useMemo(() => {
    const map = new Map<string, { name: string | null; workspaceId: string | null }>()
    for (const workspace of workspaces) {
      for (const session of workspace.sessions) {
        map.set(session.id, { name: session.name, workspaceId: session.workspaceId })
      }
    }
    return map
  }, [workspaces])

  const counts = useMemo(() => ({
    reminders: snapshot?.reminders.length ?? 0,
    workspaces: workspaces.length,
    sessions: workspaces.reduce((total, workspace) => total + workspace.sessions.length, 0),
    threads: threads.length,
  }), [snapshot?.reminders.length, threads.length, workspaces])

  const handleAdd = async () => {
    const content = newContent.trim()
    if (!content) return
    setIsSaving(true)
    setError(null)
    try {
      const created = await agentsApi.createReminder({
        content,
        workspaceId: newWorkspaceId === 'none' ? null : newWorkspaceId,
        tags: normalizeTags(newTags),
        sourceType: 'user',
        sourceSurface: 'web',
      })
      setSnapshot((current) => current ? { ...current, reminders: [created, ...current.reminders] } : current)
      setNewContent('')
      setNewTags('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add memory')
    } finally {
      setIsSaving(false)
    }
  }

  const updateReminder = async (reminder: ReminderRecord, patch: Parameters<typeof agentsApi.updateReminder>[1]) => {
    setSnapshot((current) => current ? {
      ...current,
      reminders: current.reminders.map((item) => item.id === reminder.id ? { ...item, ...patch, tags: patch.tags ? JSON.stringify(patch.tags) : item.tags } : item),
    } : current)
    try {
      const updated = await agentsApi.updateReminder(reminder.id, patch)
      setSnapshot((current) => current ? {
        ...current,
        reminders: current.reminders.map((item) => item.id === reminder.id ? updated : item),
      } : current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update memory')
      void loadSnapshot()
    }
  }

  const removeReminder = async (id: string) => {
    const previous = snapshot
    setSnapshot((current) => current ? { ...current, reminders: current.reminders.filter((reminder) => reminder.id !== id) } : current)
    try {
      await agentsApi.deleteReminder(id)
    } catch (err) {
      setSnapshot(previous)
      setError(err instanceof Error ? err.message : 'Failed to delete memory')
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Brain className="h-6 w-6" />
            Memory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agent-readable memory with workspace chat history and completed thread context.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={statusFilter} onValueChange={(next) => setStatusFilter(next as ReminderStatusFilter)}>
            <SelectTrigger className="h-10 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void loadSnapshot()} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Badge variant="outline" className="justify-center px-3 py-1">{counts.reminders} memories</Badge>
        <Badge variant="secondary" className="justify-center px-3 py-1">{counts.workspaces} workspaces</Badge>
        <Badge variant="secondary" className="justify-center px-3 py-1">{counts.sessions} chats</Badge>
        <Badge variant="secondary" className="justify-center px-3 py-1">{counts.threads} threads</Badge>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/10 shadow-none">
          <CardContent className="flex items-center gap-2 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setError(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto] lg:items-end">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="new-reminder-content">Memory</Label>
            <Textarea
              id="new-reminder-content"
              value={newContent}
              onChange={(event) => setNewContent(event.target.value)}
              placeholder="Add agent-readable memory..."
              className="min-h-20 lg:min-h-10"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Workspace</Label>
            <Select value={newWorkspaceId} onValueChange={setNewWorkspaceId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Workspace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No workspace</SelectItem>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.title || workspace.rootPath || 'Untitled workspace'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="new-reminder-tags">Tags</Label>
            <Input
              id="new-reminder-tags"
              value={newTags}
              onChange={(event) => setNewTags(event.target.value)}
              placeholder="tags, comma separated"
            />
          </div>
          <Button onClick={() => void handleAdd()} disabled={isSaving || !newContent.trim()} className="lg:self-end">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-normal text-muted-foreground">Memory List</h2>
            <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
              <SelectTrigger className="h-10 w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workspaces</SelectItem>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.title || workspace.rootPath || 'Untitled workspace'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading && !snapshot ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : reminders.length === 0 ? (
            <Card className="border-2 border-dashed shadow-none">
              <CardContent className="px-4 py-16 text-center">
                <Brain className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">No memory matches</h3>
                <p className="text-sm text-muted-foreground">Change filters or add the first memory entry.</p>
              </CardContent>
            </Card>
          ) : (
            reminders.map((reminder) => {
              const workspace = reminder.workspaceId ? workspaceById.get(reminder.workspaceId) : null
              const session = reminder.sessionId ? sessionsById.get(reminder.sessionId) : null
              const tags = parseTags(reminder.tags)
              return (
                <Card key={reminder.id}>
                  <CardContent className="p-3">
                    <Textarea
                      className="min-h-20"
                      defaultValue={reminder.content}
                      onBlur={(event) => {
                        const content = event.target.value.trim()
                        if (content && content !== reminder.content) void updateReminder(reminder, { content })
                      }}
                    />
                    <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
                      <span className="inline-flex items-center gap-1">
                        <Workflow className="h-3.5 w-3.5" />
                        {workspace?.title || workspace?.rootPath || 'No workspace'}
                      </span>
                      {session && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {session.name || 'Chat'}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDate(reminder.updatedAt)}
                      </span>
                    </div>
                    {tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {tags.map((tag) => <Badge key={tag} variant="secondary" className="rounded-md">{tag}</Badge>)}
                      </div>
                    )}
                    <Separator className="my-3" />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => void updateReminder(reminder, { status: reminder.status === 'active' ? 'archived' : 'active' })}>
                        {reminder.status === 'active' ? <Archive className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {reminder.status === 'active' ? 'Archive' : 'Restore'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void removeReminder(reminder.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        <div className="min-w-0">
          <Tabs defaultValue="workspaces" className="min-w-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
              <TabsTrigger value="threads">Threads</TabsTrigger>
            </TabsList>
            <TabsContent value="workspaces" className="mt-3">
              <ScrollArea className="max-h-[42rem] pr-1">
                <div className="space-y-2">
                  {workspaces.map((workspace) => (
                    <Card key={workspace.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{workspace.title || workspace.rootPath || 'Untitled workspace'}</div>
                            <div className="truncate text-xs text-muted-foreground">{workspace.rootPath || workspace.nodeId || 'No path'}</div>
                          </div>
                          <Badge variant="outline" className="shrink-0">{workspace.reminderCount}</Badge>
                        </div>
                        <Separator className="my-3" />
                        <div className="space-y-1.5">
                          {workspace.sessions.slice(0, 6).map((session) => (
                            <div key={session.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate">{session.name || 'Chat'}</span>
                              <span className="shrink-0 text-muted-foreground">{formatDate(session.lastActiveAt)}</span>
                            </div>
                          ))}
                          {workspace.sessions.length === 0 && <div className="text-xs text-muted-foreground">No chats yet</div>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {workspaces.length === 0 && (
                    <Card className="border-2 border-dashed shadow-none">
                      <CardContent className="p-6 text-center text-sm text-muted-foreground">No workspaces yet</CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="threads" className="mt-3">
              <ScrollArea className="max-h-[42rem] pr-1">
                <div className="space-y-2">
                  {threads.slice(0, 12).map((thread) => (
                    <Card key={thread.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{thread.title}</div>
                            <div className="truncate text-xs text-muted-foreground">{thread.providerId} · {formatDate(thread.updatedAt)}</div>
                          </div>
                          <Badge variant={thread.status === 'completed' ? 'secondary' : 'outline'} className="shrink-0">{thread.status}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {threads.length === 0 && (
                    <Card className="border-2 border-dashed shadow-none">
                      <CardContent className="p-6 text-center text-sm text-muted-foreground">No past threads yet</CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
