import { useState, useRef, useEffect, useCallback } from 'react'
import { Check, ChevronDown, ChevronRight, GripVertical, ListPlus, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface QueuedMessage {
  id: string
  content: string
  displayContent?: string
  /** timestamp when queued */
  queuedAt: number
}

interface MessageQueueProps {
  items: QueuedMessage[]
  onRemove?: (id: string) => void
  onEdit?: (id: string, newContent: string) => void
  onReorder?: (sourceId: string, targetId: string) => void
  className?: string
}

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

function QueueItemPreview({ item, index }: { item: QueuedMessage; index: number }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-background px-3 py-2 text-sm shadow-2xl ring-1 ring-primary/10">
      <div className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground">
        {index === 0 ? (
          <ListPlus className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground">
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        {index === 0 ? (
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-primary/70">
            Next
          </span>
        ) : (
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Queued #{index + 1}
          </span>
        )}
        <span className="whitespace-pre-wrap break-words text-foreground">{item.displayContent ?? item.content}</span>
      </div>
    </div>
  )
}

/* ── Inline-editable queued message row ─────────────────────────────── */

function QueueItem({
  item,
  index,
  onRemove,
  onEdit,
  onReorder,
  dragActive,
  dragOver,
  onDragStart,
}: {
  item: QueuedMessage
  index: number
  onRemove?: (id: string) => void
  onEdit?: (id: string, content: string) => void
  onReorder?: (sourceId: string, targetId: string) => void
  dragActive?: boolean
  dragOver?: boolean
  onDragStart?: (id: string, event: React.PointerEvent<HTMLButtonElement>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const [draft, setDraft] = useState(item.displayContent ?? item.content)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const showActions = editing || !dragActive

  // Focus the textarea when entering edit mode
  useEffect(() => {
    if (editing) {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }
    }
  }, [editing])

  // Keep draft in sync if the item changes externally
  useEffect(() => {
    if (!editing) setDraft(item.displayContent ?? item.content)
  }, [item.content, item.displayContent, editing])

  const commitEdit = useCallback(() => {
    const trimmed = draft.trim()
    const displayed = item.displayContent ?? item.content
    if (trimmed && trimmed !== displayed) {
      onEdit?.(item.id, trimmed)
    }
    setEditing(false)
  }, [draft, item.content, item.displayContent, item.id, onEdit])

  const cancelEdit = useCallback(() => {
    setDraft(item.displayContent ?? item.content)
    setEditing(false)
  }, [item.content, item.displayContent])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }, [commitEdit, cancelEdit])

  return (
    <div
      data-queue-id={item.id}
      className={cn(
        'group flex items-start gap-2 rounded-lg bg-muted/50 border border-border/40 px-3 py-2 text-sm transition-colors hover:bg-muted/70',
        dragActive && 'opacity-35',
        dragOver && 'border-primary/60 bg-primary/7 ring-1 ring-primary/15',
      )}
    >
      {/* Position indicator */}
      <button
        type="button"
        className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-label={collapsed ? 'Expand queued message' : 'Collapse queued message'}
        title={collapsed ? 'Expand queued message' : 'Collapse queued message'}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : index === 0 ? (
          <ListPlus className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {onReorder && !editing && (
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none select-none rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:cursor-grabbing"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          onPointerDown={(event) => onDragStart?.(item.id, event)}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Content: read-only or editable */}
      <div className="flex-1 min-w-0">
        {index === 0 && !editing && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-primary/70 block mb-0.5">
            Next
          </span>
        )}
        {index > 0 && !editing && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block mb-0.5">
            Queued #{index + 1}
          </span>
        )}
        {editing ? (
          <textarea
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            rows={Math.min(draft.split('\n').length, 5)}
            className="w-full resize-none rounded border border-primary/30 bg-background px-2 py-1 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        ) : collapsed ? (
          <button
            type="button"
            className="block w-full text-left"
            onClick={() => setCollapsed(false)}
          >
            <span className="block truncate text-foreground">{item.displayContent ?? item.content}</span>
          </button>
        ) : (
          <span className="whitespace-pre-wrap break-words text-foreground">{item.displayContent ?? item.content}</span>
        )}
      </div>

      {/* Action buttons */}
      <div className={cn(
        'flex items-center gap-0.5 shrink-0 mt-0.5 transition-opacity',
        showActions ? 'opacity-0 group-hover:opacity-100' : 'opacity-0',
      )}>
        {editing ? (
          <>
            <button
              type="button"
              className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
              onClick={commitEdit}
              title="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="p-1 rounded hover:bg-foreground/10 text-muted-foreground transition-colors"
              onClick={cancelEdit}
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            {onEdit && (
              <button
                type="button"
                className="p-1 rounded hover:bg-foreground/10 text-muted-foreground transition-colors"
                onClick={() => setEditing(true)}
                title="Edit message"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => onRemove?.(item.id)}
              title="Remove from queue"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Queue container ────────────────────────────────────────────────── */

export function MessageQueue({ items, onRemove, onEdit, onReorder, className }: MessageQueueProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragSourceId, setDragSourceId] = useState<string | null>(null)
  const [dragTargetId, setDragTargetId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null)

  useEffect(() => {
    if (!dragSourceId || !dragPreview) return

    document.body.style.cursor = 'grabbing'

    const updateTarget = (_clientX: number, clientY: number) => {
      const rows = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>('[data-queue-id]') ?? [],
      )
      if (rows.length === 0) {
        setDragTargetId(null)
        return
      }

      let nextTargetId: string | null = null
      let smallestDistance = Number.POSITIVE_INFINITY

      for (const row of rows) {
        const rowId = row.dataset.queueId
        if (!rowId || rowId === dragSourceId) continue
        const rect = row.getBoundingClientRect()
        const centerY = rect.top + rect.height / 2
        const distance = Math.abs(clientY - centerY)
        if (distance < smallestDistance) {
          smallestDistance = distance
          nextTargetId = rowId
        }
      }

      setDragTargetId(nextTargetId ?? dragSourceId)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragPreview.pointerId) return
      setDragPreview(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : prev)
      updateTarget(event.clientX, event.clientY)
    }

    const finishDrag = (event?: PointerEvent) => {
      if (event && event.pointerId !== dragPreview.pointerId) return
      if (dragSourceId && dragTargetId && dragSourceId !== dragTargetId) {
        onReorder?.(dragSourceId, dragTargetId)
      }
      setDragSourceId(null)
      setDragTargetId(null)
      setDragPreview(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)

    return () => {
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
    }
  }, [dragPreview, dragSourceId, dragTargetId, onReorder])

  const handleDragStart = useCallback((id: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!onReorder) return
    if (event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const row = event.currentTarget.closest<HTMLElement>('[data-queue-id]')
    if (!row) return
    const rect = row.getBoundingClientRect()
    setDragSourceId(id)
    setDragTargetId(id)
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
  }, [onReorder])

  if (items.length === 0) return null

  const dragItemIndex = dragPreview ? items.findIndex(item => item.id === dragPreview.id) : -1
  const dragItem = dragItemIndex >= 0 ? items[dragItemIndex] : null

  return (
    <div ref={containerRef} className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          {items.length} queued message{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      {items.map((item, i) => (
        <QueueItem
          key={item.id}
          item={item}
          index={i}
          onRemove={onRemove}
          onEdit={onEdit}
          onReorder={onReorder}
          dragActive={dragSourceId === item.id}
          dragOver={Boolean(dragSourceId && dragTargetId === item.id && dragSourceId !== item.id)}
          onDragStart={handleDragStart}
        />
      ))}
      {dragPreview && dragItem && (
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
            <QueueItemPreview item={dragItem} index={dragItemIndex} />
          </div>
        </div>
      )}
    </div>
  )
}
