import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, ChevronRight, Loader2, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
/* ── Inline-editable queued message row ─────────────────────────────── */
function QueueItem({ item, index, onRemove, onEdit, }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(item.content);
    const inputRef = useRef(null);
    // Focus the textarea when entering edit mode
    useEffect(() => {
        if (editing) {
            const el = inputRef.current;
            if (el) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
            }
        }
    }, [editing]);
    // Keep draft in sync if the item changes externally
    useEffect(() => {
        if (!editing)
            setDraft(item.content);
    }, [item.content, editing]);
    const commitEdit = useCallback(() => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== item.content) {
            onEdit?.(item.id, trimmed);
        }
        setEditing(false);
    }, [draft, item.content, item.id, onEdit]);
    const cancelEdit = useCallback(() => {
        setDraft(item.content);
        setEditing(false);
    }, [item.content]);
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitEdit();
        }
        else if (e.key === 'Escape') {
            cancelEdit();
        }
    }, [commitEdit, cancelEdit]);
    return (<div className="group flex items-start gap-2 rounded-lg bg-muted/50 border border-border/40 px-3 py-2 text-sm transition-colors hover:bg-muted/70">
      {/* Position indicator */}
      <div className="mt-0.5 shrink-0">
        {index === 0 ? (<Loader2 className="h-3.5 w-3.5 text-primary animate-spin"/>) : (<ChevronRight className="h-3.5 w-3.5 text-muted-foreground"/>)}
      </div>

      {/* Content: read-only or editable */}
      <div className="flex-1 min-w-0">
        {index === 0 && !editing && (<span className="text-[10px] font-medium uppercase tracking-wider text-primary/70 block mb-0.5">
            Next
          </span>)}
        {index > 0 && !editing && (<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block mb-0.5">
            Queued #{index + 1}
          </span>)}
        {editing ? (<textarea ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={handleKeyDown} onBlur={commitEdit} rows={Math.min(draft.split('\n').length, 5)} className="w-full resize-none rounded border border-primary/30 bg-background px-2 py-1 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"/>) : (<span className="whitespace-pre-wrap break-words text-foreground">{item.content}</span>)}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {editing ? (<>
            <button type="button" className="p-1 rounded hover:bg-primary/10 text-primary transition-colors" onClick={commitEdit} title="Save">
              <Check className="h-3.5 w-3.5"/>
            </button>
            <button type="button" className="p-1 rounded hover:bg-foreground/10 text-muted-foreground transition-colors" onClick={cancelEdit} title="Cancel">
              <X className="h-3.5 w-3.5"/>
            </button>
          </>) : (<>
            {onEdit && (<button type="button" className="p-1 rounded hover:bg-foreground/10 text-muted-foreground transition-colors" onClick={() => setEditing(true)} title="Edit message">
                <Pencil className="h-3 w-3"/>
              </button>)}
            <button type="button" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" onClick={() => onRemove?.(item.id)} title="Remove from queue">
              <X className="h-3.5 w-3.5"/>
            </button>
          </>)}
      </div>
    </div>);
}
/* ── Queue container ────────────────────────────────────────────────── */
export function MessageQueue({ items, onRemove, onEdit, className }) {
    if (items.length === 0)
        return null;
    return (<div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          {items.length} queued message{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      {items.map((item, i) => (<QueueItem key={item.id} item={item} index={i} onRemove={onRemove} onEdit={onEdit}/>))}
    </div>);
}
//# sourceMappingURL=message-queue.js.map