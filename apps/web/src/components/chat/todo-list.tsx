import { useState } from 'react'
import { CheckCircle2, ChevronDown, Circle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TodoItem {
  id: number
  title: string
  status: 'not-started' | 'in-progress' | 'completed'
}

interface TodoListProps {
  items: TodoItem[]
  className?: string
}

export function TodoList({ items, className }: TodoListProps) {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null

  const activeItem = items.find((item) => item.status === 'in-progress') ?? null
  const completed = items.filter((t) => t.status === 'completed').length
  const total = items.length
  const allCompleted = completed === total
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

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
        <span className="text-xs font-medium text-foreground">Tasks</span>
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-2xs text-muted-foreground tabular-nums">
          {completed}/{total}
        </span>
      </button>

      {!expanded && activeItem && (
        <div className="flex items-start gap-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary animate-spin" />
          <span className="min-w-0 flex-1 truncate text-foreground">
            {activeItem.title}
          </span>
        </div>
      )}

      {!expanded && !activeItem && allCompleted && (
        <div className="flex items-start gap-2 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="min-w-0 flex-1 truncate font-medium">
            All tasks completed
          </span>
        </div>
      )}

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
