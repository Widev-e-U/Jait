import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Brain, Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
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
import { TooltipHint } from '@/components/ui/tooltip'

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
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
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
    return all.filter((reminder) => (statusFilter === 'all' || reminder.status === statusFilter)
      && (projectFilter === 'all' || reminder.projectId === projectFilter)
      && reminder.content.toLowerCase().includes(search.trim().toLowerCase()))
  }, [snapshot?.reminders, projectFilter, search, statusFilter])
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
      setShowAdd(false)
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Brain className="h-6 w-6" /></span><h1 className="text-2xl font-semibold tracking-tight">Memory</h1></div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Things Jait can remember for future conversations. Review what’s saved, update it, or remove it when it’s no longer useful.</p>
        </div>
        <TooltipHint content="Refresh"><Button variant="outline" size="icon" onClick={() => void loadSnapshot()} disabled={isLoading} aria-label="Refresh"><RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} /></Button></TooltipHint>
      </header>
      {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button></div>}
      <Tabs defaultValue="memories" className="min-w-0">
        <TabsList className="flex h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="memories">Memories</TabsTrigger><TabsTrigger value="projects">Projects & chats</TabsTrigger><TabsTrigger value="threads">Threads</TabsTrigger><TabsTrigger value="secrets">SSH secrets</TabsTrigger>
        </TabsList>
        <TabsContent value="memories" className="mt-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Saved memories</h2><p className="mt-1 text-sm text-muted-foreground">{isLoading && !snapshot ? 'Loading memories…' : `${reminders.length} shown${snapshot && snapshot.reminders.length >= 200 ? ' · showing up to 200' : ''}`} · Chat history is separate.</p></div>
            <Button onClick={() => setShowAdd(!showAdd)}><Plus className="mr-2 h-4 w-4" />{showAdd ? 'Close' : 'Add memory'}</Button>
          </div>
          {showAdd && <Card><CardContent className="space-y-4 p-4 sm:p-5">
            <div className="space-y-2"><Label htmlFor="new-reminder-content">What should Jait remember?</Label><Textarea id="new-reminder-content" value={newContent} onChange={(event) => setNewContent(event.target.value)} placeholder="For example, prefer concise explanations" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Scope</Label><Select value={newProjectId} onValueChange={setNewProjectId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">All projects</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.title || project.rootPath || 'Untitled project'}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="new-reminder-tags">Tags (optional)</Label><Input id="new-reminder-tags" value={newTags} onChange={(event) => setNewTags(event.target.value)} placeholder="Separate with commas" /></div></div>
            <Button onClick={() => void handleAdd()} disabled={isSaving || !newContent.trim()}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save memory</Button>
          </CardContent></Card>}
          <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Search memories" placeholder="Search memories…" value={search} onChange={(event) => setSearch(event.target.value)} className="sm:flex-1" /><Select value={projectFilter} onValueChange={setProjectFilter}><SelectTrigger aria-label="Filter by project" className="sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All projects</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.title || project.rootPath || 'Untitled project'}</SelectItem>)}</SelectContent></Select><Select value={statusFilter} onValueChange={(next) => setStatusFilter(next as ReminderStatusFilter)}><SelectTrigger aria-label="Filter by status" className="sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="archived">Archived</SelectItem><SelectItem value="all">All statuses</SelectItem></SelectContent></Select></div>
          {isLoading && !snapshot ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : reminders.length === 0 ? <div className="rounded-xl border border-dashed px-4 py-16 text-center"><Brain className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><h3 className="font-medium">No memories found</h3><p className="mt-1 text-sm text-muted-foreground">Try another filter or add a memory.</p></div> : <div className="divide-y rounded-xl border">{reminders.map((reminder) => {
            const isEngineMemory = reminder.kind === 'engine'
            const project = reminder.projectId ? projectById.get(reminder.projectId) : null
            const session = reminder.sessionId ? sessionsById.get(reminder.sessionId) : null
            const tags = parseTags(reminder.tags)
            return <div key={reminder.id} className="space-y-3 p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="secondary">{isEngineMemory ? 'Engine memory' : project ? (project.title || project.rootPath || 'Project') : 'Global'}</Badge>{reminder.status === 'archived' && <Badge variant="outline">Archived</Badge>}<span>Updated {formatDate(reminder.updatedAt)}</span></div>
              <Textarea aria-label="Memory content" className="min-h-16 resize-y border-transparent bg-transparent px-0 shadow-none focus-visible:border-input focus-visible:px-3" defaultValue={reminder.content} readOnly={isEngineMemory} onBlur={(event) => { const content = event.target.value.trim(); if (!isEngineMemory && content && content !== reminder.content) void updateReminder(reminder, { content }); else if (!content) event.target.value = reminder.content }} />
              {tags.length > 0 && <div className="flex flex-wrap gap-1">{tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>}
              <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Details and actions</summary><div className="mt-3 space-y-3"><div className="space-y-1 text-xs text-muted-foreground"><p>Source: {reminder.sourceType} · {reminder.sourceSurface}{reminder.sourceId ? ` · ${reminder.sourceId}` : ''}</p>{session && <p>Chat: {session.name || 'Chat'}</p>}<p>Used {reminder.usageCount ?? 0} times · Last retrieved: {formatDate(reminder.lastRetrievedAt)}</p>{isEngineMemory && <p>Engine memories cannot be edited or archived here.</p>}</div><div className="flex flex-wrap gap-2">{!isEngineMemory && <Button variant="outline" size="sm" onClick={() => void updateReminder(reminder, { status: reminder.status === 'active' ? 'archived' : 'active' })}>{reminder.status === 'active' ? 'Archive' : 'Restore'}</Button>}<Button variant="outline" size="sm" onClick={() => void removeReminder(reminder.id)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div></div></details>
            </div>
          })}</div>}
          <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => void copyMarkdownExport()}><Copy className="mr-2 h-4 w-4" />{exportCopied ? 'Copied' : 'Copy by project and status as Markdown'}</Button></div>
        </TabsContent>
            <TabsContent value="projects" className="mt-6">
              <p className="mb-4 text-sm text-muted-foreground">Projects and their recent chats provide context alongside saved memories.</p>
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
            <TabsContent value="threads" className="mt-6">
              <p className="mb-4 text-sm text-muted-foreground">Recent threads are listed here as context; they are separate from saved memories.</p>
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
            <TabsContent value="secrets" className="mt-6">
              <p className="mb-4 text-sm text-muted-foreground">SSH passwords are stored separately from memories.</p>
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
                      placeholder="SSH key, for example alice@192.0.2.10:22"
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
  )
}
