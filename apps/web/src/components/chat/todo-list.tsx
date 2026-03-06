import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
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
  if (items.length === 0) return null

  const completed = items.filter((t) => t.status === 'completed').length
  const total = items.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-3 space-y-2', className)}>
      {/* Header with progress */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-foreground">Tasks</span>
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {completed}/{total}
        </span>
      </div>

      {/* Items */}
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
            <span className={cn(item.status === 'completed' && 'line-through')}>
              {item.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
