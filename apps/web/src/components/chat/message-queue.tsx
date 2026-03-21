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
  onReorder?: (sourceId: string, targetId: string | null, placement: 'before' | 'after') => void
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
  dropBefore,
  dropAfter,
  onDragStart,
}: {
  item: QueuedMessage
  index: number
  onRemove?: (id: string) => void
  onEdit?: (id: string, content: string) => void
  onReorder?: (sourceId: string, targetId: string | null, placement: 'before' | 'after') => void
  dragActive?: boolean
  dropBefore?: boolean
  dropAfter?: boolean
  onDragStart?: (id: string, event: React.PointerEvent<HTMLDivElement>) => void
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
    <>
      {dropBefore && (
        <div className="relative h-0">
          <div className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_hsl(var(--background))]" />
        </div>
      )}
      <div
      data-queue-id={item.id}
      className={cn(
        'group flex cursor-grab touch-none items-start gap-2 rounded-lg border border-border/40 bg-muted/50 px-3 py-2 text-sm transition-all duration-150 ease-out hover:bg-muted/70 active:cursor-grabbing',
        dragActive && 'border-dashed border-primary/35 bg-primary/5 opacity-0',
      )}
      onPointerDown={(event) => {
        if (editing || !onReorder) return
        const target = event.target as HTMLElement
        if (target.closest('button, textarea, input, a, [data-no-drag="true"]')) return
        onDragStart?.(item.id, event)
      }}
    >
      {/* Position indicator */}
      <button
        type="button"
        data-no-drag="true"
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
        <div
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
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
          <span className="block truncate text-foreground">{item.displayContent ?? item.content}</span>
        ) : (
          <span className="whitespace-pre-wrap break-words text-foreground">{item.displayContent ?? item.content}</span>
        )}
      </div>

      {/* Action buttons */}
      <div className={cn(
        'mt-0.5 flex shrink-0 items-center gap-0.5 transition-opacity',
        showActions ? 'opacity-0 group-hover:opacity-100' : 'opacity-0',
      )}>
        {editing ? (
          <>
            <button
              type="button"
              data-no-drag="true"
              className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
              onClick={commitEdit}
              title="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-no-drag="true"
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
                data-no-drag="true"
                className="p-1 rounded hover:bg-foreground/10 text-muted-foreground transition-colors"
                onClick={() => setEditing(true)}
                title="Edit message"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              data-no-drag="true"
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
    {dropAfter && (
      <div className="relative h-0">
        <div className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_hsl(var(--background))]" />
      </div>
    )}
    </>
  )
}

/* ── Queue container ────────────────────────────────────────────────── */

export function MessageQueue({ items, onRemove, onEdit, onReorder, className }: MessageQueueProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragCaptureElementRef = useRef<HTMLElement | null>(null)
  const [dragSourceId, setDragSourceId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ targetId: string | null; placement: 'before' | 'after' } | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null)

  useEffect(() => {
    if (dragSourceId && !items.some((item) => item.id === dragSourceId)) {
      setDragSourceId(null)
      setDropTarget(null)
      setDragPreview(null)
      return
    }
    if (dropTarget?.targetId && !items.some((item) => item.id === dropTarget.targetId)) {
      setDropTarget(dragSourceId ? { targetId: dragSourceId, placement: 'before' } : null)
    }
  }, [dragSourceId, dropTarget, items])

  useEffect(() => {
    if (!dragSourceId || !dragPreview) return

    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    document.body.style.touchAction = 'none'

    const updateTarget = (_clientX: number, clientY: number) => {
      const rows = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>('[data-queue-id]') ?? [],
      )
      if (rows.length === 0) {
        setDropTarget(null)
        return
      }

      const candidateRows = rows.filter((row) => row.dataset.queueId && row.dataset.queueId !== dragSourceId)
      if (candidateRows.length === 0) {
        setDropTarget({ targetId: null, placement: 'after' })
        return
      }

      for (const row of candidateRows) {
        const rowId = row.dataset.queueId
        if (!rowId) continue
        const rect = row.getBoundingClientRect()
        const midpoint = rect.top + rect.height / 2
        if (clientY < midpoint) {
          setDropTarget({ targetId: rowId, placement: 'before' })
          return
        }
      }

      const lastRowId = candidateRows[candidateRows.length - 1]?.dataset.queueId ?? null
      setDropTarget(lastRowId ? { targetId: lastRowId, placement: 'after' } : { targetId: null, placement: 'after' })
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragPreview.pointerId) return
      setDragPreview(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : prev)
      updateTarget(event.clientX, event.clientY)
    }

    const finishDrag = (event?: PointerEvent) => {
      if (event && event.pointerId !== dragPreview.pointerId) return
      if (dragSourceId && dropTarget) {
        if (dropTarget.targetId !== dragSourceId) {
          onReorder?.(dragSourceId, dropTarget.targetId, dropTarget.placement)
        }
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

    const handleLostPointerCapture = () => {
      finishDrag()
    }

    const handleWindowBlur = () => {
      finishDrag()
    }

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
  }, [dragPreview, dragSourceId, dropTarget, onReorder])

  const handleDragStart = useCallback((id: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (!onReorder) return
    if (event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    event.preventDefault()
    const row = event.currentTarget.closest<HTMLElement>('[data-queue-id]')
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
  }, [onReorder])

  if (items.length === 0) return null

  const displayItems = dragSourceId && dropTarget && (dropTarget.targetId !== dragSourceId || dropTarget.placement === 'after')
    ? moveItemByPlacement(items, dragSourceId, dropTarget.targetId, dropTarget.placement)
    : items
  const dragItemIndex = dragPreview ? displayItems.findIndex(item => item.id === dragPreview.id) : -1
  const dragItem = dragItemIndex >= 0 ? displayItems[dragItemIndex] : null

  return (
    <div ref={containerRef} className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          {items.length} queued message{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      {displayItems.map((item, i) => (
        <QueueItem
          key={item.id}
          item={item}
          index={i}
          onRemove={onRemove}
          onEdit={onEdit}
          onReorder={onReorder}
          dragActive={dragSourceId === item.id}
          dropBefore={Boolean(dragSourceId && dropTarget?.targetId === item.id && dropTarget.placement === 'before' && dragSourceId !== item.id)}
          dropAfter={Boolean(dragSourceId && dropTarget?.targetId === item.id && dropTarget.placement === 'after' && dragSourceId !== item.id)}
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
