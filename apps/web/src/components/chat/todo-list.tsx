import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Circle, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'

export interface TodoItem {
  id: number
  title: string
  status: 'not-started' | 'in-progress' | 'completed'
}

interface TodoListProps {
  items: TodoItem[]
  className?: string
  onClear?: () => void
  /** When true the list sits inside a shared composer surface and should not draw its own outer border. */
  merged?: boolean
}

export interface CollapsedTodoDisplay {
  headerLabel: string
  showHeaderSpinner: boolean
  showHeaderCompleted: boolean
}

export function getActiveTodoItems(items: TodoItem[]): TodoItem[] {
  return items.filter((item) => item.status === 'in-progress')
}

/** @deprecated Use getActiveTodoItems — multiple items may be in-progress. */
export function getActiveTodoItem(items: TodoItem[]): TodoItem | null {
  return getActiveTodoItems(items)[0] ?? null
}

export function areAllTodoItemsCompleted(items: TodoItem[]): boolean {
  return items.length > 0 && items.every((item) => item.status === 'completed')
}

export function getCollapsedTodoDisplay(items: TodoItem[]): CollapsedTodoDisplay {
  const activeItems = getActiveTodoItems(items)
  const allCompleted = areAllTodoItemsCompleted(items)

  const headerLabel =
    activeItems.length === 1
      ? activeItems[0].title
      : activeItems.length > 1
        ? `${activeItems.length} tasks in progress`
        : allCompleted
          ? 'All tasks completed'
          : 'Tasks'

  return {
    headerLabel,
    showHeaderSpinner: activeItems.length > 0,
    showHeaderCompleted: activeItems.length === 0 && allCompleted,
  }
}

export function TodoList({ items: rawItems, className, onClear, merged }: TodoListProps) {
  const items = Array.isArray(rawItems) ? rawItems : []
  const [expanded, setExpanded] = useState(false)

  const allCompleted = useMemo(() => areAllTodoItemsCompleted(items), [items])
  const collapsedDisplay = useMemo(() => getCollapsedTodoDisplay(items), [items])

  if (items.length === 0) return null

  const completed = items.filter((t) => t.status === 'completed').length
  const total = items.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const headerLabel = expanded ? 'Tasks' : collapsedDisplay.headerLabel
  const progressBarClassName = allCompleted ? 'bg-green-500' : 'bg-primary'

  return (
    <div className={cn(
      'space-y-2',
      merged ? 'px-3 py-2' : 'rounded-lg border bg-muted/30 p-3',
      className,
    )}>
      {/* Header with progress — clickable to toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200',
            !expanded && '-rotate-90',
          )}
        />
        {!expanded && collapsedDisplay.showHeaderSpinner && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 text-primary animate-spin" />
        )}
        {!expanded && collapsedDisplay.showHeaderCompleted && (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
        )}
        <span className="min-w-0 truncate text-xs font-medium text-foreground">{headerLabel}</span>
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-300', progressBarClassName)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-2xs text-muted-foreground tabular-nums">
          {completed}/{total}
        </span>
        {onClear && (
          <TooltipHint content="Clear todo list">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear() }}
            className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" aria-label="Clear todo list"
          >
            <X className="h-3 w-3" />
          </button>
          </TooltipHint>
        )}
      </button>

      {/* Items — collapsible */}
      {expanded && (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex items-start gap-2 text-xs py-0.5',
                item.status === 'completed' && 'text-muted-foreground',
              )}
            >
              {item.status === 'completed' ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-500" />
              ) : item.status === 'in-progress' ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary animate-spin" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/50" />
              )}
              <span className={cn('flex-1 min-w-0', item.status === 'completed' && 'line-through')}>
                {item.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
