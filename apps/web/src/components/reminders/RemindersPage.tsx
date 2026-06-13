import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertCircle, Archive, Brain, CheckCircle2, Clock3, Copy, KeyRound, Loader2, MessageSquare, Plus, RefreshCw, Trash2, Workflow } from 'lucide-react'
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
import { agentsApi, type ReminderRecord, type ReminderSnapshot, type UserSecretRecord } from '@/lib/agents-api'
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
  const [projectFilter, setProjectFilter] = useState('all')
  const [newContent, setNewContent] = useState('')
  const [newTags, setNewTags] = useState('')
  const [newProjectId, setNewProjectId] = useState('none')
  const [secrets, setSecrets] = useState<UserSecretRecord[]>([])
  const [secretLabel, setSecretLabel] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [exportCopied, setExportCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setSnapshot(await agentsApi.getRemindersSnapshot({ status: statusFilter, limit: 200 }))
      setSecrets(await agentsApi.listUserSecrets())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  const projects = snapshot?.projects ?? []
  const reminders = useMemo(() => {
    const all = snapshot?.reminders ?? []
    return projectFilter === 'all'
      ? all
      : all.filter((reminder) => reminder.projectId === projectFilter)
  }, [snapshot?.reminders, projectFilter])
  const threads = snapshot?.threads ?? []

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const sessionsById = useMemo(() => {
    const map = new Map<string, { name: string | null; projectId: string | null }>()
    for (const project of projects) {
      for (const session of project.sessions) {
        map.set(session.id, { name: session.name, projectId: session.projectId })
      }
    }
    return map
  }, [projects])

  const counts = useMemo(() => ({
    reminders: snapshot?.reminders.length ?? 0,
    projects: projects.length,
    sessions: projects.reduce((total, project) => total + project.sessions.length, 0),
    threads: threads.length,
  }), [snapshot?.reminders.length, threads.length, projects])

  const handleAdd = async () => {
    const content = newContent.trim()
    if (!content) return
    setIsSaving(true)
    setError(null)
    try {
      const created = await agentsApi.createReminder({
        content,
        projectId: newProjectId === 'none' ? null : newProjectId,
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

  const handleAddSecret = async () => {
    const label = secretLabel.trim()
    const key = secretKey.trim()
    if (!label || !key || !secretValue) return
    setIsSaving(true)
    setError(null)
    try {
      const created = await agentsApi.createUserSecret({
        type: 'ssh-password',
        key,
        label,
        value: secretValue,
      })
      setSecrets((current) => [created, ...current.filter((secret) => secret.id !== created.id)])
      setSecretLabel('')
      setSecretKey('')
      setSecretValue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save secret')
    } finally {
      setIsSaving(false)
    }
  }

  const removeSecret = async (id: string) => {
    const previous = secrets
    setSecrets((current) => current.filter((secret) => secret.id !== id))
    try {
      await agentsApi.deleteUserSecret(id)
    } catch (err) {
      setSecrets(previous)
      setError(err instanceof Error ? err.message : 'Failed to delete secret')
    }
  }

  const copyMarkdownExport = async () => {
    setError(null)
    try {
      const markdown = await agentsApi.exportMemoryMarkdown({
        status: statusFilter,
        projectId: projectFilter,
        limit: 500,
      })
      await navigator.clipboard.writeText(markdown)
      setExportCopied(true)
      window.setTimeout(() => setExportCopied(false), 1400)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy memory export')
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
            Agent-readable memory with project chat history and completed thread context.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(next) => setStatusFilter(next as ReminderStatusFilter)}>
            <SelectTrigger className="h-10 min-w-0 flex-1 sm:w-40 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="shrink-0 px-3 sm:px-4" onClick={() => void loadSnapshot()} disabled={isLoading} title="Refresh" aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4 sm:mr-2', isLoading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" className="shrink-0 px-3 sm:px-4" onClick={() => void copyMarkdownExport()} title="Copy Markdown" aria-label="Copy Markdown">
            <Copy className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{exportCopied ? 'Copied' : 'Copy Markdown'}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="outline" className="px-2 py-0.5">{counts.reminders} memories</Badge>
        <Badge variant="secondary" className="px-2 py-0.5">{counts.projects} projects</Badge>
        <Badge variant="secondary" className="px-2 py-0.5">{counts.sessions} chats</Badge>
        <Badge variant="secondary" className="px-2 py-0.5">{counts.threads} threads</Badge>
        <Badge variant="secondary" className="px-2 py-0.5">{secrets.length} secrets</Badge>
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
            <Label>Project</Label>
            <Select value={newProjectId} onValueChange={setNewProjectId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title || project.rootPath || 'Untitled project'}
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
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-10 w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title || project.rootPath || 'Untitled project'}
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
              const isEngineMemory = reminder.kind === 'engine'
              const project = reminder.projectId ? projectById.get(reminder.projectId) : null
              const session = reminder.sessionId ? sessionsById.get(reminder.sessionId) : null
              const tags = parseTags(reminder.tags)
              const sourceLabel = `${reminder.sourceType}:${reminder.sourceId || 'none'}@${reminder.sourceSurface}`
              return (
                <Card key={reminder.id}>
                  <CardContent className="p-3">
                    <Textarea
                      className="min-h-20"
                      defaultValue={reminder.content}
                      readOnly={isEngineMemory}
                      onBlur={(event) => {
                        if (isEngineMemory) return
                        const content = event.target.value.trim()
                        if (content && content !== reminder.content) void updateReminder(reminder, { content })
                      }}
                    />
                    <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
                      <span className="inline-flex items-center gap-1">
                        <Workflow className="h-3.5 w-3.5" />
                        {isEngineMemory ? 'Engine memory' : project ? (project.title || project.rootPath || 'Project') : 'Global memory'}
                      </span>
                      {session && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {session.name || 'Chat'}
                        </span>
                      )}
                      <span className="inline-flex min-w-0 items-center gap-1" title={sourceLabel}>
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="truncate">{sourceLabel}</span>
                      </span>
                      <span className="inline-flex items-center gap-1" title="Usage count">
                        <Activity className="h-3.5 w-3.5" />
                        {reminder.usageCount ?? 0} uses
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        Updated {formatDate(reminder.updatedAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        Retrieved {formatDate(reminder.lastRetrievedAt)}
                      </span>
                    </div>
                    {tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {tags.map((tag) => <Badge key={tag} variant="secondary" className="rounded-md">{tag}</Badge>)}
                      </div>
                    )}
                    <Separator className="my-3" />
                    <div className="flex flex-wrap gap-2">
                      {isEngineMemory ? null : (
                        <Button variant="outline" size="sm" onClick={() => void updateReminder(reminder, { status: reminder.status === 'active' ? 'archived' : 'active' })}>
                          {reminder.status === 'active' ? <Archive className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                          {reminder.status === 'active' ? 'Archive' : 'Restore'}
                        </Button>
                      )}
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
          <Tabs defaultValue="projects" className="min-w-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="threads">Threads</TabsTrigger>
              <TabsTrigger value="secrets">Secrets</TabsTrigger>
            </TabsList>
            <TabsContent value="projects" className="mt-3">
              <ScrollArea className="max-h-[42rem] pr-1">
                <div className="space-y-2">
                  {projects.map((project) => (
                    <Card key={project.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{project.title || project.rootPath || 'Untitled project'}</div>
                            <div className="truncate text-xs text-muted-foreground">{project.rootPath || project.nodeId || 'No path'}</div>
                          </div>
                          <Badge variant="outline" className="shrink-0">{project.reminderCount}</Badge>
                        </div>
                        <Separator className="my-3" />
                        <div className="space-y-1.5">
                          {project.sessions.slice(0, 6).map((session) => (
                            <div key={session.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate">{session.name || 'Chat'}</span>
                              <span className="shrink-0 text-muted-foreground">{formatDate(session.lastActiveAt)}</span>
                            </div>
                          ))}
                          {project.sessions.length === 0 && <div className="text-xs text-muted-foreground">No chats yet</div>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {projects.length === 0 && (
                    <Card className="border-2 border-dashed shadow-none">
                      <CardContent className="p-6 text-center text-sm text-muted-foreground">No projects yet</CardContent>
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
            <TabsContent value="secrets" className="mt-3">
              <Card>
                <CardContent className="space-y-3 p-3">
                  <div className="grid gap-2">
                    <Input
                      value={secretLabel}
                      onChange={(event) => setSecretLabel(event.target.value)}
                      placeholder="Label"
                    />
                    <Input
                      value={secretKey}
                      onChange={(event) => setSecretKey(event.target.value)}
                      placeholder="SSH key, for example jakob@192.168.178.53:22"
                    />
                    <Input
                      type="password"
                      value={secretValue}
                      onChange={(event) => setSecretValue(event.target.value)}
                      placeholder="Password"
                    />
                    <Button onClick={() => void handleAddSecret()} disabled={isSaving || !secretLabel.trim() || !secretKey.trim() || !secretValue}>
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                      Save Secret
                    </Button>
                  </div>
                  <Separator />
                  <ScrollArea className="max-h-[30rem] pr-1">
                    <div className="space-y-2">
                      {secrets.map((secret) => (
                        <Card key={secret.id}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{secret.label}</div>
                                <div className="truncate text-xs text-muted-foreground">{secret.type} · {secret.key}</div>
                                <div className="mt-1 text-xs text-muted-foreground">Last used {formatDate(secret.lastUsedAt)}</div>
                              </div>
                              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void removeSecret(secret.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {secrets.length === 0 && (
                        <Card className="border-2 border-dashed shadow-none">
                          <CardContent className="p-6 text-center text-sm text-muted-foreground">No saved secrets</CardContent>
                        </Card>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
