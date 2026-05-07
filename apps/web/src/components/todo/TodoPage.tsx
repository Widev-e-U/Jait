import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Bookmark, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleDashed, Flag, GripVertical, History, ListChecks, Loader2, Play, Plus, RefreshCw, Save, Search, Sparkles, Tags, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { agentsApi, type AutomationRepo, type JaitTodo, type ProviderId, type RuntimeMode } from '@/lib/agents-api'
import { gitApi } from '@/lib/git-api'
import { persistTodoRepoSelection, resolveTodoRepoSelection } from '@/lib/todo-repo-selection-storage'
import { buildTodoThreadRequest, buildTodoThreadStartOptions } from '@/lib/todo-thread'
import { cn } from '@/lib/utils'

type TodoMode = 'list' | 'calendar'
type TodoStatus = JaitTodo['status']
type TodoPriority = JaitTodo['priority']

const TODO_ORDER_STORAGE_KEY = 'jait.todo.order.v1'
const TODO_FILTER_STORAGE_KEY = 'jait.todo.filters.v1'

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

interface SavedTagFilter {
  id: string
  name: string
  tags: string[]
}

interface TodoFilterState {
  search: string
  tags: string[]
  savedTagFilters: SavedTagFilter[]
}

interface CompletionHistoryEntry {
  completedAt: string
  previousStatus: TodoStatus | null
}

interface CompletionEvent extends CompletionHistoryEntry {
  todoId: string
  message: string
  tags: string[]
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

function emptyTodoFilterState(): TodoFilterState {
  return { search: '', tags: [], savedTagFilters: [] }
}

function normalizeSavedTagFilters(value: unknown): SavedTagFilter[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): SavedTagFilter[] => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const tags = normalizeTags(Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : [])
    if (tags.length === 0) return []
    const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : tags.join(' + ')
    const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : tags.join('|')
    return [{ id, name, tags }]
  }).slice(0, 24)
}

function readTodoFilterMap(): Record<string, TodoFilterState> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TODO_FILTER_STORAGE_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const entries = Object.entries(parsed).flatMap(([repoId, value]): Array<[string, TodoFilterState]> => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return []
      const record = value as Record<string, unknown>
      return [[repoId, {
        search: typeof record.search === 'string' ? record.search : '',
        tags: normalizeTags(Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : []),
        savedTagFilters: normalizeSavedTagFilters(record.savedTagFilters),
      }]]
    })
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

function readTodoFilterState(repoId: string): TodoFilterState {
  return readTodoFilterMap()[repoId] ?? emptyTodoFilterState()
}

function persistTodoFilterState(repoId: string, state: TodoFilterState): void {
  if (typeof window === 'undefined' || !repoId) return
  try {
    const filterMap = readTodoFilterMap()
    filterMap[repoId] = {
      search: state.search,
      tags: normalizeTags(state.tags),
      savedTagFilters: normalizeSavedTagFilters(state.savedTagFilters),
    }
    window.localStorage.setItem(TODO_FILTER_STORAGE_KEY, JSON.stringify(filterMap))
  } catch {
    // Filters are convenience state; the todo data itself remains server-backed.
  }
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

function dateTimeLabel(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function areTagsEqual(a: string[], b: string[]): boolean {
  const left = normalizeTags(a).sort()
  const right = normalizeTags(b).sort()
  return left.length === right.length && left.every((tag, index) => tag === right[index])
}

function parseCompletionHistory(value: string | null | undefined): CompletionHistoryEntry[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry): CompletionHistoryEntry[] => {
      if (!entry || typeof entry !== 'object') return []
      const record = entry as Record<string, unknown>
      if (typeof record.completedAt !== 'string') return []
      const previousStatus = record.previousStatus === 'open' || record.previousStatus === 'in_progress' || record.previousStatus === 'done'
        ? record.previousStatus
        : null
      return [{ completedAt: record.completedAt, previousStatus }]
    })
  } catch {
    return []
  }
}

function getTodoSearchText(todo: JaitTodo): string {
  const statusMeta = getStatusMeta(todo.status)
  const tags = parseTags(todo.tags)
  return [
    todo.message,
    statusMeta.label,
    todo.status,
    todo.priority,
    todo.dueDate,
    dateLabel(todo.dueDate),
    tags.join(' '),
    todo.sourceThreadTitle,
    todo.createdAt,
    todo.updatedAt,
    todo.completedAt,
    dateTimeLabel(todo.completedAt),
  ].filter(Boolean).join(' ').toLowerCase()
}

function matchesMetadataSearch(todo: JaitTodo, search: string): boolean {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const searchable = getTodoSearchText(todo)
  return terms.every((term) => searchable.includes(term))
}

function buildCompletionEvents(todos: JaitTodo[]): CompletionEvent[] {
  return todos.flatMap((todo) => {
    const tags = parseTags(todo.tags)
    const history = parseCompletionHistory(todo.completionHistory)
    const entries = history.length > 0
      ? history
      : todo.completedAt
        ? [{ completedAt: todo.completedAt, previousStatus: null }]
        : []
    return entries.map((entry) => ({
      ...entry,
      todoId: todo.id,
      message: todo.message,
      tags,
    }))
  }).sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
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
  className,
}: {
  value?: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  className?: string
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
          className={cn('h-10 w-full justify-start gap-2 px-3 text-left font-normal', !value && 'text-muted-foreground', className)}
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
  className,
}: {
  value: string | null
  onChange: (value: string | null) => void
  className?: string
}) {
  const [isPicking, setIsPicking] = useState(Boolean(value))

  useEffect(() => {
    if (value) setIsPicking(true)
  }, [value])

  if (!isPicking) {
    return (
      <Button type="button" variant="outline" className={cn('h-10 justify-start gap-2 text-muted-foreground', className)} onClick={() => setIsPicking(true)}>
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
      className={className}
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
  className,
  inputClassName,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  commitOnBlur?: boolean
  className?: string
  inputClassName?: string
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
    <div className={cn('flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background/90 px-2 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring/60 focus-within:ring-offset-2 focus-within:ring-offset-background', className)}>
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
        className={cn('h-6 min-w-28 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground', inputClassName)}
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
  const [metadataSearch, setMetadataSearch] = useState('')
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [savedTagFilters, setSavedTagFilters] = useState<SavedTagFilter[]>([])
  const [hydratedFilterRepoId, setHydratedFilterRepoId] = useState<string | null>(null)
  const [month, setMonth] = useState(() => new Date())
  const [newMessage, setNewMessage] = useState('')
  const [newStatus, setNewStatus] = useState<TodoStatus>('open')
  const [newPriority, setNewPriority] = useState<TodoPriority>('normal')
  const [newDueDate, setNewDueDate] = useState<string | null>(null)
  const [newTags, setNewTags] = useState<string[]>([])
  const [selectedTodoIds, setSelectedTodoIds] = useState<Set<string>>(() => new Set())
  const [bulkTags, setBulkTags] = useState<string[]>([])
  const [bulkPriority, setBulkPriority] = useState<TodoPriority>('normal')
  const [bulkDueDate, setBulkDueDate] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isBulkSaving, setIsBulkSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [runningTodoIds, setRunningTodoIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const newMessageRef = useRef<HTMLTextAreaElement>(null)
  const dragCaptureElementRef = useRef<HTMLElement | null>(null)
  const [dragSourceId, setDragSourceId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ targetId: string | null; placement: 'before' | 'after' } | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null)

  const loadRepos = useCallback(async () => {
    const nextRepos = await agentsApi.listRepos()
    setRepos(nextRepos)
    setRepoId((current) => resolveTodoRepoSelection(nextRepos, current) ?? '')
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

  useEffect(() => {
    if (!repoId) {
      setMetadataSearch('')
      setTagFilters([])
      setSavedTagFilters([])
      setHydratedFilterRepoId(null)
      setSelectedTodoIds(new Set())
      return
    }
    const filterState = readTodoFilterState(repoId)
    setMetadataSearch(filterState.search)
    setTagFilters(filterState.tags)
    setSavedTagFilters(filterState.savedTagFilters)
    setHydratedFilterRepoId(repoId)
    setSelectedTodoIds(new Set())
  }, [repoId])

  useEffect(() => {
    if (!repoId || hydratedFilterRepoId !== repoId) return
    persistTodoFilterState(repoId, {
      search: metadataSearch,
      tags: tagFilters,
      savedTagFilters,
    })
  }, [hydratedFilterRepoId, metadataSearch, repoId, savedTagFilters, tagFilters])

  const filteredTodos = useMemo(() => todos.filter((todo) => {
    if (statusFilter !== 'all' && todo.status !== statusFilter) return false
    const todoTags = parseTags(todo.tags)
    if (tagFilters.length > 0 && !tagFilters.every((tag) => todoTags.includes(tag))) return false
    if (!matchesMetadataSearch(todo, metadataSearch)) return false
    return true
  }), [metadataSearch, statusFilter, tagFilters, todos])

  const counts = useMemo(() => ({
    open: todos.filter((todo) => todo.status === 'open').length,
    inProgress: todos.filter((todo) => todo.status === 'in_progress').length,
    done: todos.filter((todo) => todo.status === 'done').length,
  }), [todos])

  const selectedRepo = repos.find((repo) => repo.id === repoId)
  const repoOptions = useMemo(() => repos.map((repo) => ({ value: repo.id, label: repo.name })), [repos])
  const selectedTodos = useMemo(() => todos.filter((todo) => selectedTodoIds.has(todo.id)), [selectedTodoIds, todos])
  const selectedVisibleCount = useMemo(() => filteredTodos.filter((todo) => selectedTodoIds.has(todo.id)).length, [filteredTodos, selectedTodoIds])
  const allVisibleSelected = filteredTodos.length > 0 && selectedVisibleCount === filteredTodos.length
  const activeSavedTagFilter = savedTagFilters.find((filter) => areTagsEqual(filter.tags, tagFilters)) ?? null
  const completionEvents = useMemo(() => buildCompletionEvents(todos).slice(0, 8), [todos])

  useEffect(() => {
    setSelectedTodoIds((current) => {
      const todoIds = new Set(todos.map((todo) => todo.id))
      const next = new Set([...current].filter((id) => todoIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [todos])

  const handleRepoChange = useCallback((nextRepoId: string) => {
    setRepoId(nextRepoId)
    const repo = repos.find((item) => item.id === nextRepoId)
    persistTodoRepoSelection(nextRepoId, repo?.localPath ?? null)
  }, [repos])

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
        status: newStatus,
        priority: newPriority,
        dueDate: newDueDate,
        tags: newTags,
      })
      setTodos((current) => {
        const next = [created, ...current]
        persistTodoOrder(repoId, next)
        return next
      })
      setNewMessage('')
      setNewStatus('open')
      setNewPriority('normal')
      setNewDueDate(null)
      setNewTags([])
      window.requestAnimationFrame(() => newMessageRef.current?.focus())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add todo')
    } finally {
      setIsSaving(false)
    }
  }, [newDueDate, newMessage, newPriority, newStatus, newTags, repoId])

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
    setSelectedTodoIds((current) => {
      const next = new Set(current)
      next.delete(todoId)
      return next
    })
    try {
      await agentsApi.deleteJaitTodo(todoId)
    } catch (err) {
      setTodos(previous)
      setError(err instanceof Error ? err.message : 'Failed to remove todo')
    }
  }

  const toggleTodoSelection = useCallback((todoId: string, selected: boolean) => {
    setSelectedTodoIds((current) => {
      const next = new Set(current)
      if (selected) next.add(todoId)
      else next.delete(todoId)
      return next
    })
  }, [])

  const toggleVisibleSelection = useCallback((selected: boolean) => {
    setSelectedTodoIds((current) => {
      const next = new Set(current)
      for (const todo of filteredTodos) {
        if (selected) next.add(todo.id)
        else next.delete(todo.id)
      }
      return next
    })
  }, [filteredTodos])

  const saveCurrentTagFilter = useCallback(() => {
    const tags = normalizeTags(tagFilters)
    if (tags.length === 0) return
    const id = tags.join('|')
    setSavedTagFilters((current) => {
      if (current.some((filter) => filter.id === id || areTagsEqual(filter.tags, tags))) return current
      return [...current, { id, name: tags.join(' + '), tags }]
    })
  }, [tagFilters])

  const deleteActiveTagFilter = useCallback(() => {
    if (!activeSavedTagFilter) return
    setSavedTagFilters((current) => current.filter((filter) => filter.id !== activeSavedTagFilter.id))
  }, [activeSavedTagFilter])

  const applyBulkUpdate = async (
    buildPatch: (todo: JaitTodo) => Partial<Pick<JaitTodo, 'status' | 'priority' | 'dueDate'>> & { tags?: string[] },
    failureMessage: string,
  ) => {
    if (selectedTodos.length === 0) return
    setIsBulkSaving(true)
    setError(null)
    try {
      const updatedTodos = await Promise.all(selectedTodos.map((todo) => agentsApi.updateJaitTodo(todo.id, buildPatch(todo))))
      const updatedById = new Map(updatedTodos.map((todo) => [todo.id, todo]))
      setTodos((current) => current.map((todo) => updatedById.get(todo.id) ?? todo))
    } catch (err) {
      setError(err instanceof Error ? err.message : failureMessage)
      void loadTodos(repoId)
    } finally {
      setIsBulkSaving(false)
    }
  }

  const applyBulkStatus = async (status: TodoStatus) => {
    if (status === 'done' && selectedTodos.some((todo) => todo.status !== 'done')) playTodoSuccessSound()
    await applyBulkUpdate(() => ({ status }), 'Failed to update selected todo statuses')
  }

  const applyBulkPriority = async (priority: TodoPriority) => {
    await applyBulkUpdate(() => ({ priority }), 'Failed to update selected todo priorities')
  }

  const applyBulkDueDate = async (dueDate: string | null) => {
    await applyBulkUpdate(() => ({ dueDate }), 'Failed to update selected todo due dates')
  }

  const applyBulkTags = async () => {
    const tagsToAdd = normalizeTags(bulkTags)
    if (tagsToAdd.length === 0) return
    await applyBulkUpdate((todo) => ({ tags: normalizeTags([...parseTags(todo.tags), ...tagsToAdd]) }), 'Failed to update selected todo tags')
    setBulkTags([])
  }

  const removeSelectedTodos = async () => {
    if (selectedTodos.length === 0) return
    const previous = todos
    const selectedIds = new Set(selectedTodos.map((todo) => todo.id))
    setTodos((current) => current.filter((todo) => !selectedIds.has(todo.id)))
    setSelectedTodoIds(new Set())
    setIsBulkSaving(true)
    setError(null)
    try {
      await Promise.all([...selectedIds].map((todoId) => agentsApi.deleteJaitTodo(todoId)))
    } catch (err) {
      setTodos(previous)
      setError(err instanceof Error ? err.message : 'Failed to remove selected todos')
    } finally {
      setIsBulkSaving(false)
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

  const runTodoAsThread = async (todo: JaitTodo) => {
    if (!selectedRepo || runningTodoIds.has(todo.id)) return
    setRunningTodoIds((current) => new Set(current).add(todo.id))
    setError(null)
    try {
      const branchName = `jait/${Math.random().toString(16).slice(2, 10)}`
      const baseBranch = selectedRepo.defaultBranch
      let worktreePath: string | undefined
      try {
        const worktree = await gitApi.createWorktree(selectedRepo.localPath, baseBranch, branchName)
        worktreePath = worktree.path
      } catch {
        try {
          await gitApi.createBranch(selectedRepo.localPath, branchName, baseBranch)
        } catch {
          // Branch creation is a best-effort fallback; the thread can still run in the repo path.
        }
      }

      const thread = await agentsApi.createThread(buildTodoThreadRequest({
        repo: selectedRepo,
        providerId: provider,
        runtimeMode,
        model,
        workingDirectory: worktreePath ?? selectedRepo.localPath,
        branch: branchName,
      }))
      await agentsApi.startThread(thread.id, buildTodoThreadStartOptions(selectedRepo.name, todo))
      if (todo.status !== 'done') {
        await updateTodo(todo, { status: 'in_progress' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run todo as thread')
    } finally {
      setRunningTodoIds((current) => {
        const next = new Set(current)
        next.delete(todo.id)
        return next
      })
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
          <Select value={repoId || undefined} onValueChange={handleRepoChange} disabled={repos.length === 0}>
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

      <div className="rounded-lg border p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 rounded-lg border border-input bg-background/90 shadow-sm focus-within:ring-2 focus-within:ring-ring/60 focus-within:ring-offset-2 focus-within:ring-offset-background">
            <Textarea
              ref={newMessageRef}
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              onKeyDown={handleNewMessageKeyDown}
              placeholder="Add a future agent prompt or repo task..."
              className="min-h-20 resize-y border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <TagChipEditor
              value={newTags}
              onChange={setNewTags}
              placeholder="Add tags..."
              className="min-h-9 rounded-none rounded-b-lg border-x-0 border-b-0 border-t bg-transparent px-2 py-1 shadow-none focus-within:ring-0 focus-within:ring-offset-0"
              inputClassName="text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground lg:max-w-64 lg:justify-end">
            <OptionSelect
              value={newStatus}
              onChange={setNewStatus}
              options={statusOptions}
              className="h-8 w-[8.25rem] rounded-md border-transparent bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-1 focus:ring-ring/50 focus:ring-offset-0"
            />
            <OptionSelect
              value={newPriority}
              onChange={setNewPriority}
              options={priorityOptions}
              className="h-8 w-[6.75rem] rounded-md border-transparent bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-1 focus:ring-ring/50 focus:ring-offset-0"
            />
            <OptionalDatePicker
              value={newDueDate}
              onChange={setNewDueDate}
              className="h-8 w-[7.25rem] rounded-md border-transparent bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-1 focus:ring-ring/50 focus:ring-offset-0"
            />
            <Button onClick={() => void handleAdd()} disabled={isSaving || !repoId || !newMessage.trim()} size="sm">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(14rem,1fr)_11rem_minmax(14rem,1fr)_13rem_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={metadataSearch}
              onChange={(event) => setMetadataSearch(event.target.value)}
              placeholder="Search todo metadata..."
              className="h-10 pl-9"
            />
          </div>
          <OptionSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ value: 'all', label: 'All statuses' }, ...statusOptions]}
            className="h-10"
          />
          <TagChipEditor
            value={tagFilters}
            onChange={(tags) => setTagFilters(normalizeTags(tags))}
            placeholder="Filter tags..."
            className="min-h-10"
          />
          <Select
            value={activeSavedTagFilter?.id ?? 'custom'}
            onValueChange={(value) => {
              if (value === 'custom') {
                setTagFilters([])
                return
              }
              const saved = savedTagFilters.find((filter) => filter.id === value)
              if (saved) setTagFilters(saved.tags)
            }}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Saved filters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Unsaved filter</SelectItem>
              {savedTagFilters.map((filter) => (
                <SelectItem key={filter.id} value={filter.id}>
                  {filter.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-10 w-10" onClick={saveCurrentTagFilter} disabled={tagFilters.length === 0 || Boolean(activeSavedTagFilter)} aria-label="Save tag filter">
              <Save className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-10 w-10" onClick={deleteActiveTagFilter} disabled={!activeSavedTagFilter} aria-label="Delete saved tag filter">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="gap-1.5">
              <Bookmark className="h-3.5 w-3.5" />
              {savedTagFilters.length} saved
            </Badge>
            <span>{filteredTodos.length} shown</span>
            {(metadataSearch || tagFilters.length > 0 || statusFilter !== 'all') && (
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => {
                setMetadataSearch('')
                setTagFilters([])
                setStatusFilter('all')
              }}>
                <X className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            )}
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
      </div>

      {selectedTodos.length > 0 && (
        <div className="grid gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{selectedTodos.length} selected</Badge>
            <Button variant="outline" size="sm" onClick={() => void applyBulkStatus('open')} disabled={isBulkSaving}>Open</Button>
            <Button variant="outline" size="sm" onClick={() => void applyBulkStatus('in_progress')} disabled={isBulkSaving}>In progress</Button>
            <Button variant="outline" size="sm" onClick={() => void applyBulkStatus('done')} disabled={isBulkSaving}>Done</Button>
            <OptionSelect value={bulkPriority} onChange={(priority) => {
              setBulkPriority(priority)
              void applyBulkPriority(priority)
            }} options={priorityOptions} className="h-9 w-32" />
            <DatePicker value={bulkDueDate} onChange={(dueDate) => {
              setBulkDueDate(dueDate)
              void applyBulkDueDate(dueDate)
            }} placeholder="Due date" className="h-9 w-36" />
            <Button variant="outline" size="sm" onClick={() => void applyBulkDueDate(null)} disabled={isBulkSaving}>Clear date</Button>
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_auto_auto]">
            <TagChipEditor value={bulkTags} onChange={setBulkTags} placeholder="Add tags to selected..." className="min-h-9" />
            <Button variant="outline" size="sm" onClick={() => void applyBulkTags()} disabled={isBulkSaving || bulkTags.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Add tags
            </Button>
            <Button variant="outline" size="sm" onClick={() => void removeSelectedTodos()} disabled={isBulkSaving}>
              {isBulkSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Remove
            </Button>
          </div>
        </div>
      )}

      {completionEvents.length > 0 && (
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4 text-muted-foreground" />
            Completion history
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {completionEvents.map((event: CompletionEvent) => (
              <div key={`${event.todoId}-${event.completedAt}`} className="min-w-0 rounded-md border bg-card/40 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{dateTimeLabel(event.completedAt)}</span>
                  {event.previousStatus && <span>from {getStatusMeta(event.previousStatus).label}</span>}
                </div>
                <div className="mt-1 truncate text-sm">{event.message}</div>
                {event.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {event.tags.slice(0, 4).map((tag: string) => <Badge key={tag} variant="secondary" className="h-5 rounded px-1.5 text-[11px]">{tag}</Badge>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/40 px-3 py-2 text-sm text-muted-foreground">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={allVisibleSelected}
                onChange={(event) => toggleVisibleSelection(event.target.checked)}
              />
              <span>{selectedVisibleCount > 0 ? `${selectedVisibleCount} selected in view` : 'Select visible'}</span>
            </label>
            <span>{displayTodos.length} item{displayTodos.length === 1 ? '' : 's'}</span>
          </div>
          {displayTodos.map((todo) => {
            const tags = parseTags(todo.tags)
            const statusMeta = getStatusMeta(todo.status)
            const isRunningTodo = runningTodoIds.has(todo.id)
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
                    <input
                      data-no-drag="true"
                      type="checkbox"
                      className="mt-1.5 h-4 w-4 rounded border-input"
                      checked={selectedTodoIds.has(todo.id)}
                      onChange={(event) => toggleTodoSelection(todo.id, event.target.checked)}
                      aria-label="Select todo"
                    />
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
                  <div className="min-w-0 flex-1 rounded-lg border border-input bg-background/90 shadow-sm focus-within:ring-2 focus-within:ring-ring/60 focus-within:ring-offset-2 focus-within:ring-offset-background">
                    <Textarea className={cn('min-h-20 resize-y border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0', todo.status === 'done' && 'text-muted-foreground line-through')} defaultValue={todo.message} onBlur={(event) => {
                      const message = event.target.value.trim()
                      if (message && message !== todo.message) void updateTodo(todo, { message })
                    }} />
                    <TagChipEditor
                      value={tags}
                      onChange={(nextTags) => {
                        const normalizedTags = normalizeTags(nextTags)
                        if (JSON.stringify(normalizedTags) !== JSON.stringify(normalizeTags(tags))) {
                          void updateTodo(todo, { tags: normalizedTags })
                        }
                      }}
                      placeholder="Add tags..."
                      commitOnBlur
                      className="min-h-9 rounded-none rounded-b-lg border-x-0 border-b-0 border-t bg-transparent px-2 py-1 shadow-none focus-within:ring-0 focus-within:ring-offset-0"
                      inputClassName="text-xs"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground lg:max-w-64 lg:justify-end">
                    <OptionSelect
                      value={todo.status}
                      onChange={(status) => void updateTodoStatus(todo, status)}
                      options={statusOptions}
                      className="h-8 w-[8.25rem] rounded-md border-transparent bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-1 focus:ring-ring/50 focus:ring-offset-0"
                    />
                    <OptionSelect
                      value={todo.priority}
                      onChange={(priority) => void updateTodo(todo, { priority })}
                      options={priorityOptions}
                      className="h-8 w-[6.75rem] rounded-md border-transparent bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-1 focus:ring-ring/50 focus:ring-offset-0"
                    />
                    <DatePicker
                      value={todo.dueDate ?? null}
                      onChange={(dueDate) => void updateTodo(todo, { dueDate })}
                      placeholder="Date"
                      className="h-8 w-[7.25rem] rounded-md border-transparent bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-1 focus:ring-ring/50 focus:ring-offset-0"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => void runTodoAsThread(todo)}
                      disabled={isRunningTodo || !selectedRepo}
                      title="Run todo as thread"
                      aria-label="Run todo as thread"
                    >
                      {isRunningTodo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => void removeTodo(todo.id)} aria-label="Remove todo">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
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
