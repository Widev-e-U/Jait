import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Circle, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TodoItem {
  id: number
  title: string
  status: 'not-started' | 'in-progress' | 'completed'
}

interface TodoListProps {
  items: TodoItem[]
  className?: string
  onClear?: () => void
}

export interface CollapsedTodoDisplay {
  headerLabel: string
  showHeaderSpinner: boolean
  showHeaderCompleted: boolean
}

export function getActiveTodoItem(items: TodoItem[]): TodoItem | null {
  return items.find((item) => item.status === 'in-progress') ?? null
}

export function areAllTodoItemsCompleted(items: TodoItem[]): boolean {
  return items.length > 0 && items.every((item) => item.status === 'completed')
}

export function getCollapsedTodoDisplay(items: TodoItem[]): CollapsedTodoDisplay {
  const activeItem = getActiveTodoItem(items)
  const allCompleted = areAllTodoItemsCompleted(items)

  return {
    headerLabel: activeItem ? activeItem.title : allCompleted ? 'All tasks completed' : 'Tasks',
    showHeaderSpinner: Boolean(activeItem),
    showHeaderCompleted: !activeItem && allCompleted,
  }
}

export function TodoList({ items, className, onClear }: TodoListProps) {
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
    <div className={cn('rounded-lg border bg-muted/30 p-3 space-y-2', className)}>
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
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear() }}
            className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Clear todo list"
          >
            <X className="h-3 w-3" />
          </button>
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
