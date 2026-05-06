import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, Circle, ListChecks, Loader2, Plus, RefreshCw, Tags } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { agentsApi, type AutomationRepo, type RepoProposal } from '@/lib/agents-api'

type TodoMode = 'list' | 'calendar'
type TodoStatus = RepoProposal['status']
type TodoPriority = RepoProposal['priority']

const statusOptions: { value: TodoStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

const priorityOptions: { value: TodoPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
]

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

function tagsToInput(tags: string[]): string {
  return tags.join(', ')
}

function normalizeTagInput(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
}

function buildCalendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

export function TodoPage() {
  const [repos, setRepos] = useState<AutomationRepo[]>([])
  const [repoId, setRepoId] = useState('')
  const [todos, setTodos] = useState<RepoProposal[]>([])
  const [mode, setMode] = useState<TodoMode>('list')
  const [statusFilter, setStatusFilter] = useState<TodoStatus | 'all'>('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [month, setMonth] = useState(() => new Date())
  const [newMessage, setNewMessage] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newTags, setNewTags] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRepos = useCallback(async () => {
    const nextRepos = await agentsApi.listRepos()
    setRepos(nextRepos)
    setRepoId((current) => current || nextRepos[0]?.id || '')
  }, [])

  const loadTodos = useCallback(async (targetRepoId: string) => {
    if (!targetRepoId) {
      setTodos([])
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setTodos(await agentsApi.listRepoProposals(targetRepoId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load todo list')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        await loadRepos()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load repositories')
        setIsLoading(false)
      }
    })()
  }, [loadRepos])

  useEffect(() => {
    void loadTodos(repoId)
  }, [loadTodos, repoId])

  const allTags = useMemo(() => (
    [...new Set(todos.flatMap((todo) => parseTags(todo.tags)))].sort()
  ), [todos])

  const filteredTodos = useMemo(() => todos.filter((todo) => {
    if (statusFilter !== 'all' && todo.status !== statusFilter) return false
    if (tagFilter !== 'all' && !parseTags(todo.tags).includes(tagFilter)) return false
    return true
  }), [statusFilter, tagFilter, todos])

  const counts = useMemo(() => ({
    open: todos.filter((todo) => todo.status === 'open').length,
    inProgress: todos.filter((todo) => todo.status === 'in_progress').length,
    done: todos.filter((todo) => todo.status === 'done').length,
  }), [todos])

  const selectedRepo = repos.find((repo) => repo.id === repoId)

  const handleAdd = async () => {
    const message = newMessage.trim()
    if (!repoId || !message) return
    setIsSaving(true)
    setError(null)
    try {
      const created = await agentsApi.createRepoProposal(repoId, {
        message,
        dueDate: newDueDate || null,
        tags: normalizeTagInput(newTags),
      })
      setTodos((current) => [created, ...current])
      setNewMessage('')
      setNewDueDate('')
      setNewTags('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add todo')
    } finally {
      setIsSaving(false)
    }
  }

  const updateTodo = async (todo: RepoProposal, patch: Partial<Pick<RepoProposal, 'message' | 'status' | 'priority' | 'dueDate'>> & { tags?: string[] }) => {
    setTodos((current) => current.map((item) => item.id === todo.id ? { ...item, ...patch, tags: patch.tags ? JSON.stringify(patch.tags) : item.tags } : item))
    try {
      const updated = await agentsApi.updateRepoProposal(todo.id, patch)
      setTodos((current) => current.map((item) => item.id === todo.id ? updated : item))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update todo')
      void loadTodos(repoId)
    }
  }

  const removeTodo = async (todoId: string) => {
    const previous = todos
    setTodos((current) => current.filter((todo) => todo.id !== todoId))
    try {
      await agentsApi.deleteRepoProposal(todoId)
    } catch (err) {
      setTodos(previous)
      setError(err instanceof Error ? err.message : 'Failed to remove todo')
    }
  }

  const todosByDate = useMemo(() => {
    const map = new Map<string, RepoProposal[]>()
    for (const todo of filteredTodos) {
      if (!todo.dueDate) continue
      map.set(todo.dueDate, [...(map.get(todo.dueDate) ?? []), todo])
    }
    return map
  }, [filteredTodos])

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <ListChecks className="h-6 w-6" />
            Todo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Global repo follow-up work, saved from agents or added directly here.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={repoId} onChange={(event) => setRepoId(event.target.value)}>
            {repos.map((repo) => <option key={repo.id} value={repo.id}>{repo.name}</option>)}
          </select>
          <Button variant="outline" onClick={() => void loadTodos(repoId)} disabled={isLoading || !repoId}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Badge variant="outline" className="justify-center px-3 py-1">{todos.length} total</Badge>
        <Badge variant="secondary" className="justify-center px-3 py-1">{counts.open} open</Badge>
        <Badge variant="secondary" className="justify-center px-3 py-1">{counts.inProgress} active</Badge>
        <Badge variant="secondary" className="justify-center px-3 py-1">{counts.done} done</Badge>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setError(null)}>Dismiss</Button>
        </div>
      )}

      <div className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_160px_220px_auto]">
        <Textarea value={newMessage} onChange={(event) => setNewMessage(event.target.value)} placeholder="Add a future agent prompt or repo task..." className="min-h-20 lg:min-h-10" />
        <Input type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} />
        <Input value={newTags} onChange={(event) => setNewTags(event.target.value)} placeholder="tags, comma separated" />
        <Button onClick={() => void handleAdd()} disabled={isSaving || !repoId || !newMessage.trim()} className="lg:self-start">
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TodoStatus | 'all')}>
            <option value="all">All statuses</option>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="all">All tags</option>
            {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant={mode === 'list' ? 'secondary' : 'outline'} onClick={() => setMode('list')}>
            <ListChecks className="mr-2 h-4 w-4" />
            List
          </Button>
          <Button variant={mode === 'calendar' ? 'secondary' : 'outline'} onClick={() => setMode('calendar')}>
            <CalendarDays className="mr-2 h-4 w-4" />
            Calendar
          </Button>
        </div>
      </div>

      {isLoading && todos.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !selectedRepo ? (
        <div className="rounded-lg border-2 border-dashed px-4 py-16 text-center text-sm text-muted-foreground">
          Add a repository in manager mode before creating todo items.
        </div>
      ) : mode === 'calendar' ? (
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>Prev</Button>
            <div className="font-medium">{monthLabel(month)}</div>
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>Next</Button>
          </div>
          <div className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="py-2">{day}</div>)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-7">
            {buildCalendarDays(month).map((day) => {
              const key = toDateKey(day)
              const dayTodos = todosByDate.get(key) ?? []
              const muted = day.getMonth() !== month.getMonth()
              return (
                <div key={key} className="min-h-32 border-b p-2 sm:border-r [&:nth-child(7n)]:border-r-0">
                  <div className={`mb-2 text-xs font-medium ${muted ? 'text-muted-foreground' : ''}`}>{day.getDate()}</div>
                  <div className="space-y-1">
                    {dayTodos.map((todo) => (
                      <button key={todo.id} className="w-full rounded-md border px-2 py-1 text-left text-xs hover:bg-accent" onClick={() => void updateTodo(todo, { status: todo.status === 'done' ? 'open' : 'done' })}>
                        <span className={todo.status === 'done' ? 'line-through text-muted-foreground' : ''}>{todo.message}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : filteredTodos.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed px-4 py-16 text-center">
          <Tags className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">No todo items match</h3>
          <p className="text-sm text-muted-foreground">Change filters or add the first repo-wide item.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTodos.map((todo) => {
            const tags = parseTags(todo.tags)
            return (
              <div key={todo.id} className="rounded-lg border p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                  <button className="mt-1 h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => void updateTodo(todo, { status: todo.status === 'done' ? 'open' : 'done' })} aria-label="Toggle todo status">
                    {todo.status === 'done' ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  </button>
                  <Textarea className="min-h-20 flex-1" defaultValue={todo.message} onBlur={(event) => {
                    const message = event.target.value.trim()
                    if (message && message !== todo.message) void updateTodo(todo, { message })
                  }} />
                  <div className="grid gap-2 sm:grid-cols-2 lg:w-96">
                    <select className="h-9 rounded-md border bg-background px-2 text-sm" value={todo.status} onChange={(event) => void updateTodo(todo, { status: event.target.value as TodoStatus })}>
                      {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className="h-9 rounded-md border bg-background px-2 text-sm" value={todo.priority} onChange={(event) => void updateTodo(todo, { priority: event.target.value as TodoPriority })}>
                      {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <Input type="date" value={todo.dueDate ?? ''} onChange={(event) => void updateTodo(todo, { dueDate: event.target.value || null })} />
                    <Button variant="outline" onClick={() => void removeTodo(todo.id)}>Remove</Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input defaultValue={tagsToInput(tags)} placeholder="tags, comma separated" onBlur={(event) => {
                    const nextTags = normalizeTagInput(event.target.value)
                    if (tagsToInput(nextTags) !== tagsToInput(tags)) void updateTodo(todo, { tags: nextTags })
                  }} />
                  {todo.sourceThreadTitle && <span className="text-xs text-muted-foreground">Suggested by `{todo.sourceThreadTitle}`</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
