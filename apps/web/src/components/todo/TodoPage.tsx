import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, ListChecks, Loader2, Plus, RefreshCw, Tags, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { agentsApi, type AutomationRepo, type JaitTodo } from '@/lib/agents-api'
import { cn } from '@/lib/utils'

type TodoMode = 'list' | 'calendar'
type TodoStatus = JaitTodo['status']
type TodoPriority = JaitTodo['priority']

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

function normalizeTagInput(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
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

function parseDateKey(value: string | null | undefined): Date | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function dateLabel(value: string | null | undefined): string {
  const date = parseDateKey(value)
  if (!date) return 'No due date'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
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

function DatePicker({
  value,
  onChange,
  placeholder = 'Set due date',
}: {
  value?: string | null
  onChange: (value: string | null) => void
  placeholder?: string
}) {
  const selectedDate = parseDateKey(value)
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ?? new Date())

  const commitDate = (nextValue: string | null) => {
    onChange(nextValue)
    setOpen(false)
  }

  useEffect(() => {
    if (selectedDate) setVisibleMonth(selectedDate)
  }, [selectedDate?.getTime()])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('h-10 w-full justify-start gap-2 px-3 text-left font-normal', !value && 'text-muted-foreground')}
        >
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span className="truncate">{value ? dateLabel(value) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[19rem] p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium">{monthLabel(visibleMonth)}</div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <div key={`${day}-${index}`} className="py-1">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {buildCalendarDays(visibleMonth).map((day) => {
            const key = toDateKey(day)
            const selected = value === key
            const today = key === toDateKey(new Date())
            const muted = day.getMonth() !== visibleMonth.getMonth()
            return (
              <Button
                key={key}
                type="button"
                variant={selected ? 'secondary' : 'ghost'}
                size="icon"
                className={cn('h-8 w-8 rounded-md text-xs font-normal', muted && 'text-muted-foreground/55', today && !selected && 'border border-border')}
                onClick={() => commitDate(key)}
              >
                {day.getDate()}
              </Button>
            )
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => commitDate(toDateKey(new Date()))}>
            Today
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => commitDate(null)}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function OptionSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function TagChipEditor({
  value,
  onChange,
  placeholder = 'Add tag...',
  commitOnBlur = false,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  commitOnBlur?: boolean
}) {
  const [draft, setDraft] = useState('')
  const tags = normalizeTags(value)

  const addDraft = () => {
    const nextTags = normalizeTagInput(draft)
    if (nextTags.length === 0) return
    onChange(normalizeTags([...tags, ...nextTags]))
    setDraft('')
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((current) => current !== tag))
  }

  return (
    <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background/90 px-2 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring/60 focus-within:ring-offset-2 focus-within:ring-offset-background">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="h-6 gap-1 rounded-md px-2 text-xs">
          <span>{tag}</span>
          <button
            type="button"
            className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            onClick={() => removeTag(tag)}
            aria-label={`Remove ${tag} tag`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={draft}
        onChange={(event) => {
          const nextValue = event.target.value
          if (nextValue.includes(',')) {
            const parts = nextValue.split(',')
            const last = parts.pop() ?? ''
            const nextTags = normalizeTags([...tags, ...parts])
            if (nextTags.length !== tags.length || nextTags.some((tag, index) => tag !== tags[index])) {
              onChange(nextTags)
            }
            setDraft(last.trimStart())
            return
          }
          setDraft(nextValue)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            addDraft()
          } else if (event.key === 'Backspace' && !draft && tags.length > 0) {
            event.preventDefault()
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => {
          if (commitOnBlur) addDraft()
        }}
        className="h-6 min-w-28 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        placeholder={tags.length === 0 ? placeholder : ''}
      />
    </div>
  )
}

export function TodoPage() {
  const [repos, setRepos] = useState<AutomationRepo[]>([])
  const [repoId, setRepoId] = useState('')
  const [todos, setTodos] = useState<JaitTodo[]>([])
  const [mode, setMode] = useState<TodoMode>('list')
  const [statusFilter, setStatusFilter] = useState<TodoStatus | 'all'>('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [month, setMonth] = useState(() => new Date())
  const [newMessage, setNewMessage] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newTags, setNewTags] = useState<string[]>([])
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
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setTodos(await agentsApi.listJaitTodos(targetRepoId))
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
  const repoOptions = useMemo(() => repos.map((repo) => ({ value: repo.id, label: repo.name })), [repos])
  const tagOptions = useMemo(() => [
    { value: 'all', label: 'All tags' },
    ...allTags.map((tag) => ({ value: tag, label: tag })),
  ], [allTags])

  const handleAdd = async () => {
    const message = newMessage.trim()
    if (!repoId || !message) return
    setIsSaving(true)
    setError(null)
    try {
      const created = await agentsApi.createJaitTodo(repoId, {
        message,
        dueDate: newDueDate || null,
        tags: newTags,
      })
      setTodos((current) => [created, ...current])
      setNewMessage('')
      setNewDueDate('')
      setNewTags([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add todo')
    } finally {
      setIsSaving(false)
    }
  }

  const updateTodo = async (todo: JaitTodo, patch: Partial<Pick<JaitTodo, 'message' | 'status' | 'priority' | 'dueDate'>> & { tags?: string[] }) => {
    setTodos((current) => current.map((item) => item.id === todo.id ? { ...item, ...patch, tags: patch.tags ? JSON.stringify(patch.tags) : item.tags } : item))
    try {
      const updated = await agentsApi.updateJaitTodo(todo.id, patch)
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
      await agentsApi.deleteJaitTodo(todoId)
    } catch (err) {
      setTodos(previous)
      setError(err instanceof Error ? err.message : 'Failed to remove todo')
    }
  }

  const todosByDate = useMemo(() => {
    const map = new Map<string, JaitTodo[]>()
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
          <Select value={repoId || undefined} onValueChange={setRepoId} disabled={repos.length === 0}>
            <SelectTrigger className="h-10 min-w-56">
              <SelectValue placeholder="Select repository" />
            </SelectTrigger>
            <SelectContent>
              {repoOptions.map((repo) => (
                <SelectItem key={repo.value} value={repo.value}>
                  {repo.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void loadTodos(repoId)} disabled={isLoading || !repoId}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
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
        <DatePicker value={newDueDate} onChange={(next) => setNewDueDate(next ?? '')} />
        <TagChipEditor value={newTags} onChange={setNewTags} placeholder="Add tags..." />
        <Button onClick={() => void handleAdd()} disabled={isSaving || !repoId || !newMessage.trim()} className="lg:self-start">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <OptionSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ value: 'all', label: 'All statuses' }, ...statusOptions]}
            className="h-10 w-full sm:w-44"
          />
          <OptionSelect value={tagFilter} onChange={setTagFilter} options={tagOptions} className="h-10 w-full sm:w-44" />
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
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <div className="font-medium">{monthLabel(month)}</div>
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
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
                  <div className={cn('mb-2 text-xs font-medium', muted && 'text-muted-foreground')}>{day.getDate()}</div>
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
                    <OptionSelect value={todo.status} onChange={(status) => void updateTodo(todo, { status })} options={statusOptions} />
                    <OptionSelect value={todo.priority} onChange={(priority) => void updateTodo(todo, { priority })} options={priorityOptions} />
                    <DatePicker value={todo.dueDate ?? null} onChange={(dueDate) => void updateTodo(todo, { dueDate })} />
                    <Button variant="outline" onClick={() => void removeTodo(todo.id)}>Remove</Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <TagChipEditor
                    value={tags}
                    onChange={(nextTags) => {
                      const normalizedTags = normalizeTags(nextTags)
                      if (JSON.stringify(normalizedTags) !== JSON.stringify(normalizeTags(tags))) {
                        void updateTodo(todo, { tags: normalizedTags })
                      }
                    }}
                    commitOnBlur
                  />
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
