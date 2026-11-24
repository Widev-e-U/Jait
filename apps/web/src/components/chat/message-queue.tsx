import { AttachmentList, collectAttachments } from './attachment-list'
import type { ChatAttachment } from '@/hooks/useChat'
import { userMessageTextFromSegments, type UserMessageSegment, type UserReferencedFile } from '@/lib/user-message-segments'
import { PromptInput, type PromptInputHandle, type PromptInputContextProps } from './prompt-input'
import { createUserMessageEditSubmission, getQueuedMessageEditSegments } from './message-edit'
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
  referencedFiles?: UserReferencedFile[]
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
  composerContext?: PromptInputContextProps
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

interface QueueDropTarget {
  targetId: string
  placement: 'before' | 'after'
}

interface QueueDrag {
  id: string
  pointerId: number
  row: HTMLElement
  grabOffset: number
  offset: number
  target: QueueDropTarget | null
}

function getDropTarget(
  queue: HTMLDivElement,
  source: HTMLElement,
  clientX: number,
  clientY: number,
): QueueDropTarget | null {
  const { left, right, top, bottom } = queue.getBoundingClientRect()
  if (clientX < left || clientX > right || clientY < top || clientY > bottom) return null

  const rows = Array.from(queue.querySelectorAll<HTMLElement>('[data-queue-id]'))
  const sourceIndex = rows.indexOf(source)
  if (sourceIndex < 0) return null

  const nextIndex = rows.findIndex(row => {
    const rect = row.getBoundingClientRect()
    return clientY < rect.top + rect.height / 2
  })
  const insertionIndex = nextIndex < 0 ? rows.length : nextIndex
  if (insertionIndex === sourceIndex || insertionIndex === sourceIndex + 1) return null

  const targetId = rows[nextIndex < 0 ? rows.length - 1 : nextIndex]?.dataset.queueId
  return targetId ? { targetId, placement: nextIndex < 0 ? 'after' : 'before' } : null
}

/* ── Inline-editable queued message row ─────────────────────────────── */

function QueueItem({
  item,
  composerContext,
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
  dragOffset,
  onDragStart,
}: {
  item: QueuedMessage
  composerContext?: PromptInputContextProps
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
  dragOffset?: number
  onDragStart?: (id: string, event: React.PointerEvent<HTMLElement>) => void
}) {
  const setEditing = useCallback((next: boolean) => onEditingChange(item.id, next), [item.id, onEditingChange])
  const [collapsed, setCollapsed] = useState(true)
  const [draft, setDraft] = useState(item.displayContent ?? item.content)
  const [draftSegments, setDraftSegments] = useState(() => getQueuedMessageEditSegments(item))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<PromptInputHandle>(null)
  const dragging = dragOffset !== undefined
  const showActions = editing || !dragging
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
    setDraftSegments(getQueuedMessageEditSegments(item))
  }, [item, editing])

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
    <div
      ref={cardRef}
      className={cn(
        'group flex items-start gap-2 rounded-lg border border-border/40 bg-muted/50 px-3 py-2 text-sm transition-colors duration-150 ease-out hover:bg-muted/70',
        iconOnly && 'relative gap-1 pl-2 pr-1 py-2',
        editing && 'border-primary/30 bg-background p-3',
        dragging && 'relative z-10 border-primary/35 bg-background shadow-lg hover:bg-background',
      )}
      style={dragging ? { transform: `translateY(${dragOffset}px)` } : undefined}
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
          data-queue-drag-handle
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
            <PromptInput {...composerContext} ref={inputRef} draftStateKey={`queue-edit:${item.id}`} value={draft}
              segments={draftSegments}
              initialAttachments={collectAttachments(item.attachments, item.displaySegments)}
              onChange={value => { setDraft(value); setDraftSegments(inputRef.current?.getSegments() ?? []) }}
              onSubmit={(_files, attachments, segments) => { void commitEdit(attachments, segments) }}
              disabled={saving} controlsDisabled={saving} clearOnSubmit={false} submitLabel="Save changes" placeholder="Edit message..."
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
                onClick={() => { anchorToggle('bottom'); setEditing(true) }} aria-label="Edit message"
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
  )
}

/* ── Queue container ────────────────────────────────────────────────── */

export function MessageQueue({ items, composerContext, onEditingChange, onRemove, onEdit, onReorder, onSteer, onStopAndSteer, onSendToParallelThread, parallelActionLabel, onToggleHold, iconOnly, className }: MessageQueueProps) {
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
  const [drag, setDrag] = useState<QueueDrag | null>(null)
  const dragPointerId = drag?.pointerId
  const dragSourceId = drag?.id

  useEffect(() => {
    if (dragPointerId === undefined) return
    const queue = containerRef.current
    const cancelDrag = () => setDrag(null)
    window.addEventListener('blur', cancelDrag)
    return () => {
      window.removeEventListener('blur', cancelDrag)
      if (queue?.hasPointerCapture(dragPointerId)) queue.releasePointerCapture(dragPointerId)
    }
  }, [dragPointerId])

  useEffect(() => {
    if (dragSourceId && (!onReorder || !items.some(item => item.id === dragSourceId))) setDrag(null)
  }, [dragSourceId, items, onReorder])

  const handleDragStart = (id: string, event: React.PointerEvent<HTMLElement>) => {
    if (!onReorder || drag || event.button !== 0) return
    const queue = containerRef.current
    const row = event.currentTarget.closest<HTMLElement>('[data-queue-id]')
    if (!queue || !row) return

    event.preventDefault()
    queue.setPointerCapture(event.pointerId)
    setDrag({ id, pointerId: event.pointerId, row, grabOffset: event.clientY - row.getBoundingClientRect().top, offset: 0, target: null })
  }

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const queue = event.currentTarget
    const bounds = queue.getBoundingClientRect()
    const row = drag.row.getBoundingClientRect()
    // The outer row stays in flow so hit testing and transcript height stay stable.
    const top = Math.min(Math.max(event.clientY - drag.grabOffset, bounds.top), bounds.bottom - row.height)
    const target = getDropTarget(queue, drag.row, event.clientX, event.clientY)
    setDrag({ ...drag, offset: top - row.top, target })
  }

  const handleDrop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const target = getDropTarget(event.currentTarget, drag.row, event.clientX, event.clientY)
    setDrag(null)
    if (target) onReorder?.(drag.id, target.targetId, target.placement)
  }

  const handleDragCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerId === dragPointerId) setDrag(null)
  }

  if (items.length === 0) return null

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="text-xs font-medium text-muted-foreground">
          {items.length} queued message{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div
        ref={containerRef}
        className={cn('flex flex-col gap-1.5', drag && 'select-none cursor-grabbing')}
        onPointerMove={handleDragMove}
        onPointerUp={handleDrop}
        onPointerCancel={handleDragCancel}
        onLostPointerCapture={handleDragCancel}
      >
        {items.map((item, i) => {
          const dropPlacement = drag?.target?.targetId === item.id ? drag.target.placement : undefined
          return (
            <div key={item.id} className="relative" data-queue-id={item.id} data-queue-drop={dropPlacement}>
              <QueueItem
                item={item}
                composerContext={composerContext}
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
                dragOffset={drag?.id === item.id ? drag.offset : undefined}
                onDragStart={handleDragStart}
              />
              {dropPlacement && (
                <div aria-hidden="true" className={cn(
                  'pointer-events-none absolute inset-x-2 z-20 h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_hsl(var(--background))]',
                  dropPlacement === 'before' ? 'top-0' : 'bottom-0',
                )} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
