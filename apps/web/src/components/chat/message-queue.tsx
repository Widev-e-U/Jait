import { ChevronRight, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface QueuedMessage {
  id: string
  content: string
  /** timestamp when queued */
  queuedAt: number
}

interface MessageQueueProps {
  items: QueuedMessage[]
  onRemove?: (id: string) => void
  className?: string
}

export function MessageQueue({ items, onRemove, className }: MessageQueueProps) {
  if (items.length === 0) return null

  return (
    <div className={cn('space-y-1', className)}>
      {items.map((item, i) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 px-3 py-1.5 text-xs"
        >
          {i === 0 ? (
            <Loader2 className="h-3 w-3 shrink-0 text-primary animate-spin" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate flex-1 text-muted-foreground">
            {i === 0 ? 'Next: ' : `#${i + 1}: `}
            <span className="text-foreground">{item.content}</span>
          </span>
          <button
            type="button"
            className="p-0.5 rounded hover:bg-foreground/10 text-muted-foreground shrink-0 transition-colors"
            onClick={() => onRemove?.(item.id)}
            title="Remove from queue"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
