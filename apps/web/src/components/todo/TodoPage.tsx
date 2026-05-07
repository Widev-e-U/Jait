import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleDashed, Flag, GripVertical, ListChecks, Loader2, Plus, RefreshCw, Sparkles, Tags, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { agentsApi, type AutomationRepo, type JaitTodo, type ProviderId, type RuntimeMode } from '@/lib/agents-api'
import { cn } from '@/lib/utils'

type TodoMode = 'list' | 'calendar'
type TodoStatus = JaitTodo['status']
type TodoPriority = JaitTodo['priority']

const TODO_ORDER_STORAGE_KEY = 'jait.todo.order.v1'

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

interface DragPreviewState {
  id: string
  pointerId: number
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

function getStatusMeta(status: TodoStatus): { label: string; iconClassName: string; itemClassName: string } {
  switch (status) {
    case 'done':
      return {
        label: 'Done',
        iconClassName: 'text-emerald-500',
        itemClassName: 'border-emerald-500/20 bg-emerald-500/[0.04]',
      }
    case 'in_progress':
      return {
        label: 'In progress',
        iconClassName: 'text-sky-500',
        itemClassName: 'border-sky-500/20 bg-sky-500/[0.035]',
      }
    case 'open':
    default:
      return {
        label: 'Open',
        iconClassName: 'text-muted-foreground',
        itemClassName: 'bg-card/40',
      }
  }
}

function getPriorityClassName(priority: TodoPriority): string {
  switch (priority) {
    case 'high':
      return 'text-amber-500'
    case 'low':
      return 'text-muted-foreground/70'
    case 'normal':
    default:
      return 'text-primary/70'
  }
}

function TodoStatusIcon({ status, className }: { status: TodoStatus; className?: string }) {
  const meta = getStatusMeta(status)
  if (status === 'done') return <CheckCircle2 className={cn('h-5 w-5', meta.iconClassName, className)} />
  if (status === 'in_progress') return <CircleDashed className={cn('h-5 w-5', meta.iconClassName, className)} />
  return <Circle className={cn('h-5 w-5', meta.iconClassName, className)} />
}

function readTodoOrderMap(): Record<string, string[]> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TODO_ORDER_STORAGE_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string[]] => (
        typeof entry[0] === 'string' && Array.isArray(entry[1]) && entry[1].every((id) => typeof id === 'string')
      )),
    )
  } catch {
    return {}
  }
}

function persistTodoOrder(repoId: string, items: JaitTodo[]): void {
  if (typeof window === 'undefined' || !repoId) return
  try {
    const orderMap = readTodoOrderMap()
    orderMap[repoId] = items.map((todo) => todo.id)
    window.localStorage.setItem(TODO_ORDER_STORAGE_KEY, JSON.stringify(orderMap))
  } catch {
    // localStorage can be unavailable in private contexts; ordering still works in memory.
  }
}

function applyStoredTodoOrder(repoId: string, items: JaitTodo[]): JaitTodo[] {
  const storedOrder = readTodoOrderMap()[repoId]
  if (!storedOrder?.length) return items

  const rank = new Map(storedOrder.map((id, index) => [id, index]))
  const originalIndex = new Map(items.map((item, index) => [item.id, index]))
  return [...items].sort((a, b) => {
    const aRank = rank.get(a.id)
    const bRank = rank.get(b.id)
    if (aRank != null && bRank != null) return aRank - bRank
    if (aRank != null) return -1
    if (bRank != null) return 1
    return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0)
  })
}

function moveItemByPlacement<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string | null,
  placement: 'before' | 'after',
): T[] {
  const sourceIndex = items.findIndex((item) => item.id === sourceId)
  if (sourceIndex < 0) return items

  const next = [...items]
  const [moved] = next.splice(sourceIndex, 1)
  if (!moved) return items

  if (targetId == null) {
    next.push(moved)
    return next
  }

  const targetIndex = next.findIndex((item) => item.id === targetId)
  if (targetIndex < 0) return items
  next.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, moved)
  return next
}

function playTodoSuccessSound(): void {
  if (typeof window === 'undefined') return
  try {
    const AudioContextCtor = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const context = new AudioContextCtor()
    const startedAt = context.currentTime
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, startedAt)
    gain.gain.exponentialRampToValueAtTime(0.08, startedAt + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.34)
    gain.connect(context.destination)

    for (const [index, frequency] of [660, 880].entries()) {
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, startedAt + index * 0.08)
      oscillator.connect(gain)
      oscillator.start(startedAt + index * 0.08)
      oscillator.stop(startedAt + 0.22 + index * 0.08)
    }

    window.setTimeout(() => void context.close(), 450)
  } catch {
    // Sound is optional and may be blocked by browser audio policies.
  }
}

function TodoItemPreview({ todo }: { todo: JaitTodo }) {
  const statusMeta = getStatusMeta(todo.status)
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border bg-background px-3 py-2 text-sm shadow-2xl ring-1 ring-primary/10', statusMeta.itemClassName)}>
      <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      <TodoStatusIcon status={todo.status} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground">
          <span>{statusMeta.label}</span>
          <Flag className={cn('h-3 w-3', getPriorityClassName(todo.priority))} />
          <span>{todo.priority}</span>
        </div>
        <span className={cn('whitespace-pre-wrap break-words text-foreground', todo.status === 'done' && 'text-muted-foreground line-through')}>
          {todo.message}
        </span>
      </div>
    </div>
  )
}

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
  placeholder = 'Add date',
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

function OptionalDatePicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) {
  const [isPicking, setIsPicking] = useState(Boolean(value))

  useEffect(() => {
    if (value) setIsPicking(true)
  }, [value])

  if (!isPicking) {
    return (
      <Button type="button" variant="outline" className="h-10 justify-start gap-2 text-muted-foreground" onClick={() => setIsPicking(true)}>
        <CalendarDays className="h-4 w-4" />
        Add date
      </Button>
    )
  }

  return (
    <DatePicker
      value={value}
      onChange={(nextValue) => {
        onChange(nextValue)
        if (!nextValue) setIsPicking(false)
      }}
    />
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

export function TodoPage({
  provider = 'jait',
  model = null,
  runtimeMode = 'full-access',
}: {
  provider?: ProviderId
  model?: string | null
  runtimeMode?: RuntimeMode
}) {
  const [repos, setRepos] = useState<AutomationRepo[]>([])
  const [repoId, setRepoId] = useState('')
  const [todos, setTodos] = useState<JaitTodo[]>([])
  const [mode, setMode] = useState<TodoMode>('list')
  const [statusFilter, setStatusFilter] = useState<TodoStatus | 'all'>('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [month, setMonth] = useState(() => new Date())
  const [newMessage, setNewMessage] = useState('')
  const [newDueDate, setNewDueDate] = useState<string | null>(null)
  const [newTags, setNewTags] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const newMessageRef = useRef<HTMLTextAreaElement>(null)
  const dragCaptureElementRef = useRef<HTMLElement | null>(null)
  const [dragSourceId, setDragSourceId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ targetId: string | null; placement: 'before' | 'after' } | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null)

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
      setTodos(applyStoredTodoOrder(targetRepoId, await agentsApi.listJaitTodos(targetRepoId)))
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

  useEffect(() => {
    if (isLoading || !selectedRepo || mode !== 'list') return
    const frame = window.requestAnimationFrame(() => {
      newMessageRef.current?.focus()
      newMessageRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isLoading, mode, selectedRepo?.id])

  const handleAdd = useCallback(async () => {
    const message = newMessage.trim()
    if (!repoId || !message) return
    setIsSaving(true)
    setError(null)
    try {
      const created = await agentsApi.createJaitTodo(repoId, {
        message,
        dueDate: newDueDate,
        tags: newTags,
      })
      setTodos((current) => {
        const next = [created, ...current]
        persistTodoOrder(repoId, next)
        return next
      })
      setNewMessage('')
      setNewDueDate(null)
      setNewTags([])
      window.requestAnimationFrame(() => newMessageRef.current?.focus())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add todo')
    } finally {
      setIsSaving(false)
    }
  }, [newDueDate, newMessage, newTags, repoId])

  const handleNewMessageKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleAdd()
    }
  }, [handleAdd])

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

  const updateTodoStatus = async (todo: JaitTodo, status: TodoStatus) => {
    if (todo.status !== 'done' && status === 'done') playTodoSuccessSound()
    await updateTodo(todo, { status })
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

  const generateTodos = async () => {
    if (!repoId) return
    setIsGenerating(true)
    setError(null)
    try {
      const result = await agentsApi.generateJaitTodos(repoId, {
        provider,
        model,
        runtimeMode,
      })
      if (result.todos.length === 0) {
        setError('No new todo suggestions were generated.')
        return
      }
      setTodos((current) => {
        const generatedIds = new Set(result.todos.map((todo) => todo.id))
        const next = [...result.todos, ...current.filter((todo) => !generatedIds.has(todo.id))]
        persistTodoOrder(repoId, next)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate todos')
    } finally {
      setIsGenerating(false)
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

  useEffect(() => {
    if (dragSourceId && !filteredTodos.some((item) => item.id === dragSourceId)) {
      setDragSourceId(null)
      setDropTarget(null)
      setDragPreview(null)
      return
    }
    if (dropTarget?.targetId && !filteredTodos.some((item) => item.id === dropTarget.targetId)) {
      setDropTarget(dragSourceId ? { targetId: dragSourceId, placement: 'before' } : null)
    }
  }, [dragSourceId, dropTarget, filteredTodos])

  useEffect(() => {
    if (!dragSourceId || !dragPreview) return

    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    document.body.style.touchAction = 'none'

    const updateTarget = (clientY: number) => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>('[data-todo-id]'),
      )
      const candidateRows = rows.filter((row) => row.dataset.todoId && row.dataset.todoId !== dragSourceId)

      if (candidateRows.length === 0) {
        setDropTarget({ targetId: null, placement: 'after' })
        return
      }

      for (const row of candidateRows) {
        const rowId = row.dataset.todoId
        if (!rowId) continue
        const rect = row.getBoundingClientRect()
        if (clientY < rect.top + rect.height / 2) {
          setDropTarget({ targetId: rowId, placement: 'before' })
          return
        }
      }

      const lastRowId = candidateRows[candidateRows.length - 1]?.dataset.todoId ?? null
      setDropTarget(lastRowId ? { targetId: lastRowId, placement: 'after' } : { targetId: null, placement: 'after' })
    }

    const finishDrag = (event?: PointerEvent) => {
      if (event && event.pointerId !== dragPreview.pointerId) return
      if (dropTarget && dropTarget.targetId !== dragSourceId) {
        setTodos((current) => {
          const next = moveItemByPlacement(current, dragSourceId, dropTarget.targetId, dropTarget.placement)
          if (next === current) return current
          persistTodoOrder(repoId, next)
          return next
        })
      }
      const captureElement = dragCaptureElementRef.current
      if (captureElement?.hasPointerCapture?.(dragPreview.pointerId)) {
        captureElement.releasePointerCapture?.(dragPreview.pointerId)
      }
      dragCaptureElementRef.current = null
      setDragSourceId(null)
      setDropTarget(null)
      setDragPreview(null)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragPreview.pointerId) return
      setDragPreview((prev) => prev ? { ...prev, x: event.clientX, y: event.clientY } : prev)
      updateTarget(event.clientY)
    }

    const handleLostPointerCapture = () => finishDrag()
    const handleWindowBlur = () => finishDrag()

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
    window.addEventListener('blur', handleWindowBlur)
    dragCaptureElementRef.current?.addEventListener('lostpointercapture', handleLostPointerCapture)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.body.style.touchAction = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
      window.removeEventListener('blur', handleWindowBlur)
      dragCaptureElementRef.current?.removeEventListener('lostpointercapture', handleLostPointerCapture)
    }
  }, [dragPreview, dragSourceId, dropTarget, repoId])

  const handleDragStart = useCallback((id: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    event.preventDefault()
    const row = event.currentTarget.closest<HTMLElement>('[data-todo-id]')
    if (!row) return
    dragCaptureElementRef.current = row
    row.setPointerCapture?.(event.pointerId)
    const rect = row.getBoundingClientRect()
    setDragSourceId(id)
    setDropTarget({ targetId: id, placement: 'before' })
    setDragPreview({
      id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
  }, [])

  const displayTodos = dragSourceId && dropTarget && (dropTarget.targetId !== dragSourceId || dropTarget.placement === 'after')
    ? moveItemByPlacement(filteredTodos, dragSourceId, dropTarget.targetId, dropTarget.placement)
    : filteredTodos
  const dragTodo = dragPreview ? displayTodos.find((todo) => todo.id === dragPreview.id) : null

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
          <Button variant="outline" onClick={() => void generateTodos()} disabled={isGenerating || isLoading || !repoId}>
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Badge variant="outline" className="justify-center gap-1.5 px-3 py-1"><ListChecks className="h-3.5 w-3.5 text-primary/70" />{todos.length} total</Badge>
        <Badge variant="secondary" className="justify-center gap-1.5 px-3 py-1"><Circle className="h-3.5 w-3.5 text-muted-foreground" />{counts.open} open</Badge>
        <Badge variant="secondary" className="justify-center gap-1.5 px-3 py-1"><CircleDashed className="h-3.5 w-3.5 text-sky-500" />{counts.inProgress} active</Badge>
        <Badge variant="secondary" className="justify-center gap-1.5 px-3 py-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{counts.done} done</Badge>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setError(null)}>Dismiss</Button>
        </div>
      )}

      <div className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_160px_220px_auto]">
        <Textarea
          ref={newMessageRef}
          value={newMessage}
          onChange={(event) => setNewMessage(event.target.value)}
          onKeyDown={handleNewMessageKeyDown}
          placeholder="Add a future agent prompt or repo task..."
          className="min-h-20 lg:min-h-10"
        />
        <OptionalDatePicker value={newDueDate} onChange={setNewDueDate} />
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
                    {dayTodos.map((todo) => {
                      const statusMeta = getStatusMeta(todo.status)
                      return (
                      <button key={todo.id} className={cn('flex w-full items-start gap-1.5 rounded-md border px-2 py-1 text-left text-xs hover:bg-accent', statusMeta.itemClassName)} onClick={() => void updateTodoStatus(todo, todo.status === 'done' ? 'open' : 'done')}>
                        <TodoStatusIcon status={todo.status} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className={todo.status === 'done' ? 'line-through text-muted-foreground' : ''}>{todo.message}</span>
                      </button>
                      )
                    })}
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
          {displayTodos.map((todo) => {
            const tags = parseTags(todo.tags)
            const statusMeta = getStatusMeta(todo.status)
            const dropBefore = Boolean(dragSourceId && dropTarget?.targetId === todo.id && dropTarget.placement === 'before' && dragSourceId !== todo.id)
            const dropAfter = Boolean(dragSourceId && dropTarget?.targetId === todo.id && dropTarget.placement === 'after' && dragSourceId !== todo.id)
            return (
              <div key={todo.id} className="space-y-3">
                {dropBefore && (
                  <div className="relative h-0">
                    <div className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_hsl(var(--background))]" />
                  </div>
                )}
              <div
                data-todo-id={todo.id}
                className={cn(
                  'group rounded-lg border p-3 transition-all duration-150 ease-out',
                  statusMeta.itemClassName,
                  dragSourceId && 'touch-none',
                  dragSourceId === todo.id && 'border-dashed border-primary/35 bg-primary/5 opacity-0',
                )}
                onPointerDown={(event) => {
                  const target = event.target as HTMLElement
                  if (target.closest('button, textarea, input, a, [data-no-drag="true"]')) return
                  handleDragStart(todo.id, event)
                }}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                  <div className="flex items-start gap-1.5">
                    <div
                      className="mt-1 shrink-0 cursor-grab rounded p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground active:cursor-grabbing"
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <button className="mt-0.5 h-6 w-6 shrink-0 rounded text-muted-foreground hover:text-foreground" onClick={() => void updateTodoStatus(todo, todo.status === 'done' ? 'open' : 'done')} aria-label="Toggle todo status">
                      <TodoStatusIcon status={todo.status} />
                    </button>
                  </div>
                  <Textarea className="min-h-20 flex-1" defaultValue={todo.message} onBlur={(event) => {
                    const message = event.target.value.trim()
                    if (message && message !== todo.message) void updateTodo(todo, { message })
                  }} />
                  <div className="grid gap-2 sm:grid-cols-2 lg:w-96">
                    <OptionSelect value={todo.status} onChange={(status) => void updateTodoStatus(todo, status)} options={statusOptions} />
                    <OptionSelect value={todo.priority} onChange={(priority) => void updateTodo(todo, { priority })} options={priorityOptions} />
                    <DatePicker value={todo.dueDate ?? null} onChange={(dueDate) => void updateTodo(todo, { dueDate })} />
                    <Button variant="outline" onClick={() => void removeTodo(todo.id)}>
                      <Trash2 className="mr-2 h-4 w-4 text-muted-foreground" />
                      Remove
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <TodoStatusIcon status={todo.status} className="h-3.5 w-3.5" />
                      {statusMeta.label}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Flag className={cn('h-3.5 w-3.5', getPriorityClassName(todo.priority))} />
                      {todo.priority}
                    </span>
                  </div>
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
                {dropAfter && (
                  <div className="relative h-0">
                    <div className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_hsl(var(--background))]" />
                  </div>
                )}
              </div>
            )
          })}
          {dragPreview && dragTodo && (
            <div
              className="pointer-events-none fixed z-50"
              style={{
                left: `${dragPreview.x - dragPreview.offsetX}px`,
                top: `${dragPreview.y - dragPreview.offsetY}px`,
                width: `${dragPreview.width}px`,
                minHeight: `${dragPreview.height}px`,
              }}
            >
              <div className="scale-[1.01] opacity-95">
                <TodoItemPreview todo={dragTodo} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
