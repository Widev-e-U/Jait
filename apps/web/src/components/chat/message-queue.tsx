import { AttachmentList, collectAttachments } from './attachment-list'
import type { ChatAttachment } from '@/hooks/useChat'
import { userMessageTextFromSegments, type UserMessageSegment } from '@/lib/user-message-segments'
import { PromptInput, type PromptInputHandle } from './prompt-input'
import { createUserMessageEditSubmission } from './message-edit'
import { getMessageEditPromptClassName } from './message-edit-layout'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, GitBranch, GripVertical, ListPlus, Lock, LockOpen, Pencil, Square, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'
import { useToolCardToggleAnchor } from './tool-card-anchor'

export interface QueuedMessage {
  id: string
  content: string
  displayContent?: string
  attachments?: ChatAttachment[] | string[]
  displaySegments?: UserMessageSegment[]
  /** timestamp when queued */
  queuedAt: number
  /** When true, the queue drain skips this message until the user unlocks it. */
  held?: boolean
  /**
   * A steer the gateway has accepted but not injected yet. It stays visible as
   * an unsent row ("Queued") until the running loop reaches its round boundary
   * and consumes it; the drain must never send it as its own turn.
   */
  pendingSteer?: boolean
}

interface MessageQueueProps {
  items: QueuedMessage[]
  onEditingChange?: (editing: boolean) => void
  onRemove?: (id: string) => void
  onEdit?: (id: string, newContent: string, attachments?: ChatAttachment[], displaySegments?: UserMessageSegment[]) => void | Promise<void>
  onReorder?: (sourceId: string, targetId: string | null, placement: 'before' | 'after') => void
  onSteer?: (id: string) => void
  onStopAndSteer?: (id: string) => void
  onSendToParallelThread?: (id: string) => void
  parallelActionLabel?: string
  onToggleHold?: (id: string) => void
  /**
   * Render row actions as icon-only buttons (no text labels). Used on narrow
   * mobile layouts where the labelled action buttons take too much space.
   */
  iconOnly?: boolean
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
          <span className="mb-0.5 block text-2xs font-medium uppercase tracking-wider text-primary/70">
            Next
          </span>
        ) : (
          <span className="mb-0.5 block text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Queued #{index + 1}
          </span>
        )}
        <AttachmentList attachments={collectAttachments(item.attachments, item.displaySegments)} className="mb-1.5" />
        <span className="whitespace-pre-wrap break-words text-foreground">{item.displayContent ?? item.content}</span>
      </div>
    </div>
  )
}

/* ── Inline-editable queued message row ─────────────────────────────── */

function QueueItem({
  item,
  index,
  editing,
  onEditingChange,
  onRemove,
  onEdit,
  onReorder,
  onSteer,
  onStopAndSteer,
  onSendToParallelThread,
  parallelActionLabel,
  onToggleHold,
  iconOnly,
  dragActive,
  dropBefore,
  dropAfter,
  onDragStart,
}: {
  item: QueuedMessage
  index: number
  editing: boolean
  onEditingChange: (id: string, editing: boolean) => void
  onRemove?: (id: string) => void
  onEdit?: (id: string, content: string, attachments?: ChatAttachment[], displaySegments?: UserMessageSegment[]) => void | Promise<void>
  onReorder?: (sourceId: string, targetId: string | null, placement: 'before' | 'after') => void
  onSteer?: (id: string) => void
  onStopAndSteer?: (id: string) => void
  onSendToParallelThread?: (id: string) => void
  parallelActionLabel?: string
  onToggleHold?: (id: string) => void
  iconOnly?: boolean
  dragActive?: boolean
  dropBefore?: boolean
  dropAfter?: boolean
  onDragStart?: (id: string, event: React.PointerEvent<HTMLElement>) => void
}) {
  const setEditing = useCallback((next: boolean) => onEditingChange(item.id, next), [item.id, onEditingChange])
  const [collapsed, setCollapsed] = useState(true)
  const [draft, setDraft] = useState(item.displayContent ?? item.content)
  const [draftSegments, setDraftSegments] = useState<UserMessageSegment[]>(item.displaySegments ?? [{ type: 'text', text: item.displayContent ?? item.content }])
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<PromptInputHandle>(null)
  const showActions = editing || !dragActive
  const { cardRef, anchorToggle } = useToolCardToggleAnchor('top')
  const toggleCollapsed = () => {
    anchorToggle()
    setCollapsed(prev => !prev)
  }

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
  }, [editing])

  // Keep draft in sync if the item changes externally
  useEffect(() => {
    if (editing) return
    setDraft(item.displayContent ?? item.content)
    setDraftSegments(item.displaySegments ?? [{ type: 'text', text: item.displayContent ?? item.content }])
  }, [item.content, item.displayContent, item.displaySegments, editing])

  const commitEdit = useCallback(async (attachments?: ChatAttachment[], segments?: UserMessageSegment[]) => {
    if (saving) return
    const currentSegments = segments ?? inputRef.current?.getSegments() ?? draftSegments
    const submission = createUserMessageEditSubmission(userMessageTextFromSegments(currentSegments), currentSegments, item.displaySegments, attachments)
    if (!submission) return
    setSaving(true)
    try {
      await onEdit?.(item.id, submission.text, collectAttachments(undefined, submission.displaySegments), submission.displaySegments)
      setEditing(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save queued message')
    } finally {
      setSaving(false)
    }
  }, [saving, draftSegments, item, onEdit, setEditing])

  const cancelEdit = useCallback(() => {
    setDraft(item.displayContent ?? item.content)
    setEditing(false)
  }, [item.content, item.displayContent, setEditing])

  return (
    <>
      {dropBefore && (
        <div className="relative h-0">
          <div className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_hsl(var(--background))]" />
        </div>
      )}
      <div
      ref={cardRef}
      data-queue-id={item.id}
      className={cn(
        'group flex items-start gap-2 rounded-lg border border-border/40 bg-muted/50 px-3 py-2 text-sm transition-all duration-150 ease-out hover:bg-muted/70',
        iconOnly && 'relative gap-1 pl-2 pr-1 py-2',
        editing && 'border-primary/30 bg-background p-3',
        dragActive && 'border-dashed border-primary/35 bg-primary/5 opacity-0',
      )}
    >
      {/* Position indicator */}
      {!editing && <TooltipHint content={collapsed ? 'Expand queued message' : 'Collapse queued message'}>
      <button
        type="button"
        data-no-drag="true"
        className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand queued message' : 'Collapse queued message'}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : index === 0 ? (
          <ListPlus className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      </TooltipHint>}

      {onReorder && !editing && !item.pendingSteer && (
        <TooltipHint content="Drag to reorder">
        <button
          type="button"
          onPointerDown={event => onDragStart?.(item.id, event)}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        </TooltipHint>
      )}

      {/* Content: read-only or editable */}
      <div className="flex-1 min-w-0">
        {!editing && (
          <span className={cn('mb-0.5 flex items-center gap-1.5', iconOnly && 'mb-3')}>
            {item.pendingSteer ? (
              <span className="text-2xs font-medium uppercase tracking-wider text-primary/70">
                Queued #{index + 1}
              </span>
            ) : index === 0 ? (
              <span className="text-2xs font-medium uppercase tracking-wider text-primary/70">
                Next
              </span>
            ) : (
              <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                Queued #{index + 1}
              </span>
            )}
            {item.pendingSteer && !editing && (
              <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1 py-px text-2xs font-medium uppercase tracking-wider text-primary">
                <ArrowRight className="h-2.5 w-2.5" />
                Sends after this step
              </span>
            )}
            {item.held && !editing && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px text-2xs font-medium uppercase tracking-wider text-amber-500">
                <Lock className="h-2.5 w-2.5" />
                Held
              </span>
            )}
          </span>
        )}
        {!editing && <AttachmentList attachments={collectAttachments(item.attachments, item.displaySegments)} className="mb-1.5" />}
        {editing ? (
          <div data-no-drag="true" data-queue-editor
            onKeyDown={event => {
              if (event.key === 'Escape' && !saving) { event.stopPropagation(); cancelEdit() }
            }}>
            <div className="mb-2 flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-primary/70">
              <ListPlus className="h-3.5 w-3.5" /> {index === 0 ? "Next" : `Queued #${index + 1}`}
              <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground"><Pencil className="h-3 w-3" /> Editing</span>
            </div>
            <PromptInput ref={inputRef} draftStateKey={`queue-edit:${item.id}`} value={draft}
              segments={draftSegments}
              initialAttachments={collectAttachments(item.attachments, item.displaySegments)}
              onChange={value => { setDraft(value); setDraftSegments(inputRef.current?.getSegments() ?? []) }}
              onSubmit={(_files, attachments, segments) => { void commitEdit(attachments, segments) }}
              disabled={saving} controlsDisabled={saving} clearOnSubmit={false} submitLabel="Save changes" placeholder="Edit message..."
              availableFiles={[]}
              footerTrailingContent={<Button type="button" variant="ghost" size="sm"
                disabled={saving} onClick={cancelEdit} aria-label="Cancel editing message">Cancel</Button>}
              className={getMessageEditPromptClassName()} />
          </div>
        ) : collapsed ? (
          <button type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} className="block w-full min-w-0 text-left text-foreground"><span className={cn('block', iconOnly ? 'line-clamp-2 break-words' : 'truncate')}>{item.displayContent ?? item.content}</span></button>
        ) : (
          <button type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} className="block w-full text-left whitespace-pre-wrap break-words text-foreground">{item.displayContent ?? item.content}</button>
        )}
      </div>

      {/* Action buttons */}
      <div className={cn(
        'mt-0.5 flex shrink-0 items-center gap-0.5 transition-opacity',
        iconOnly && 'absolute right-1 top-1.5 mt-0 gap-0',
        iconOnly || onSteer ? 'opacity-100' : showActions ? 'opacity-0 group-hover:opacity-100' : 'opacity-0',
      )}>
        {editing ? null : (
          <>
            {onEdit && !item.pendingSteer && (
              <TooltipHint content="Edit message">
              <button
                type="button"
                data-no-drag="true"
                className="p-1 rounded hover:bg-foreground/10 text-muted-foreground transition-colors"
                onClick={() => { anchorToggle(); setEditing(true) }} aria-label="Edit message"
              >
                <Pencil className="h-3 w-3" />
              </button>
              </TooltipHint>
            )}
            {onSteer && !item.pendingSteer && (
              <div className="inline-flex items-center" data-no-drag="true">
              <TooltipHint content="Steer with message">
              <button
                type="button"
                data-no-drag="true"
                aria-label="Steer with message"
                className={cn(
                  'text-primary transition-colors',
                  iconOnly
                    ? 'p-1 rounded hover:bg-primary/10'
                    : 'inline-flex h-6 items-center gap-1 rounded border border-primary/25 bg-primary/5 px-1.5 text-2xs font-medium hover:bg-primary/10',
                )}
                onClick={() => onSteer(item.id)}
              >
                {!iconOnly && <span>Steer</span>}
                <ArrowRight className="h-3 w-3" />
              </button>
              </TooltipHint>
              {onStopAndSteer && (
                <DropdownMenu>
                  <TooltipHint content="Steering options">
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        data-no-drag="true"
                        aria-label="Steering options"
                        className={cn(
                          'rounded p-1 text-primary transition-colors hover:bg-primary/10',
                          !iconOnly && 'ml-0.5 h-6 border border-primary/25 bg-primary/5',
                        )}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipHint>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onSteer(item.id)}>
                      <ArrowRight className="mr-2 h-3.5 w-3.5" />
                      Steer
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onStopAndSteer(item.id)}>
                      <Square className="mr-2 h-3.5 w-3.5" />
                      Stop and steer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              </div>
            )}
            {onSendToParallelThread && (
              <TooltipHint content={parallelActionLabel ?? 'Send to parallel thread'}>
              <button
                type="button"
                data-no-drag="true"
                aria-label={parallelActionLabel ?? 'Send to parallel thread'}
                className={cn(
                  'rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary',
                  iconOnly || !parallelActionLabel
                    ? 'p-1'
                    : 'inline-flex h-6 items-center gap-1 border border-primary/20 px-1.5 text-2xs font-medium',
                )}
                onClick={() => onSendToParallelThread(item.id)}
              >
                {!iconOnly && parallelActionLabel && <span>{parallelActionLabel}</span>}
                <GitBranch className="h-3 w-3" />
              </button>
              </TooltipHint>
            )}
            {onToggleHold && !item.pendingSteer && (
              <TooltipHint content={item.held ? 'Unlock — allow this message to be sent' : 'Hold — keep this message from being sent until you unlock it'}>
              <button
                type="button"
                data-no-drag="true"
                className={cn(
                  'p-1 rounded transition-colors',
                  item.held
                    ? 'text-amber-500 hover:bg-amber-500/10'
                    : 'text-muted-foreground hover:bg-foreground/10',
                )}
                onClick={() => onToggleHold(item.id)}
                aria-pressed={item.held}
              >
                {item.held ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
              </button>
              </TooltipHint>
            )}
            <TooltipHint content="Remove from queue">
            <button
              type="button"
              data-no-drag="true"
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => onRemove?.(item.id)} aria-label="Remove from queue"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            </TooltipHint>
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

export function MessageQueue({ items, onEditingChange, onRemove, onEdit, onReorder, onSteer, onStopAndSteer, onSendToParallelThread, parallelActionLabel, onToggleHold, iconOnly, className }: MessageQueueProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = editingId !== null && items.some(item => item.id === editingId)
  const handleEditingChange = useCallback((id: string, active: boolean) => {
    setEditingId(current => active ? id : current === id ? null : current)
  }, [])
  useEffect(() => {
    onEditingChange?.(editing)
    return () => { if (editing) onEditingChange?.(false) }
  }, [editing, onEditingChange])
  useEffect(() => {
    if (editingId !== null && !items.some(item => item.id === editingId)) setEditingId(null)
  }, [editingId, items])
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

  const handleDragStart = useCallback((id: string, event: React.PointerEvent<HTMLElement>) => {
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
        <span className="text-xs font-medium text-muted-foreground">
          {items.length} queued message{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      {displayItems.map((item, i) => (
        <QueueItem
          key={item.id}
          item={item}
          index={i}
          editing={editingId === item.id}
          onEditingChange={handleEditingChange}
          onRemove={onRemove}
          onEdit={onEdit}
          onReorder={items.length > 1 ? onReorder : undefined}
          onSteer={onSteer}
          onStopAndSteer={onStopAndSteer}
          onSendToParallelThread={onSendToParallelThread}
          parallelActionLabel={parallelActionLabel}
          onToggleHold={onToggleHold}
          iconOnly={iconOnly}
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
