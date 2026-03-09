import { Check, FileText, Undo2, ExternalLink } from 'lucide-react';
import { FileIcon } from '@/components/icons/file-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
export function FilesChanged({ files, onAccept, onReject, onAcceptAll, onRejectAll, onFileClick, className, }) {
    if (files.length === 0)
        return null;
    const undecided = files.filter((f) => f.state === 'undecided').length;
    return (<div className={cn('rounded-lg border bg-muted/30 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-muted-foreground"/>
          <span className="text-xs font-medium">
            Files changed ({files.length})
          </span>
          {undecided > 0 && (<span className="text-[10px] text-amber-500 dark:text-amber-400">
              {undecided} pending
            </span>)}
        </div>
        {undecided > 0 && (<div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onAcceptAll}>
              <Check className="h-3 w-3 mr-1"/>
              Keep all
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onRejectAll}>
              <Undo2 className="h-3 w-3 mr-1"/>
              Undo all
            </Button>
          </div>)}
      </div>

      {/* File list */}
      <div className="divide-y">
        {files.map((file) => (<div key={file.path} className={cn('flex items-center gap-2 px-3 py-1.5 text-xs', file.state === 'accepted' && 'bg-green-500/5', file.state === 'rejected' && 'bg-red-500/5 text-muted-foreground')}>
            <FileIcon filename={file.name} className="h-3.5 w-3.5 shrink-0"/>
            <button type="button" className={cn('truncate flex-1 text-left hover:underline cursor-pointer', file.state === 'rejected' && 'line-through')} title={`Review diff for ${file.path}`} onClick={() => onFileClick?.(file.path)}>
              {file.path}
            </button>

            {file.state === 'undecided' && (<div className="flex items-center gap-0.5 shrink-0">
                <button type="button" className="p-1 rounded hover:bg-primary/10 text-primary transition-colors" onClick={() => onFileClick?.(file.path)} title="Review changes">
                  <ExternalLink className="h-3 w-3"/>
                </button>
                <button type="button" className="p-1 rounded hover:bg-green-500/20 text-green-600 dark:text-green-400 transition-colors" onClick={() => onAccept?.(file.path)} title="Keep all changes">
                  <Check className="h-3 w-3"/>
                </button>
                <button type="button" className="p-1 rounded hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors" onClick={() => onReject?.(file.path)} title="Undo all changes">
                  <Undo2 className="h-3 w-3"/>
                </button>
              </div>)}
            {file.state === 'accepted' && (<span className="text-[10px] text-green-600 dark:text-green-400 shrink-0">Kept</span>)}
            {file.state === 'rejected' && (<span className="text-[10px] text-red-500 shrink-0">Undone</span>)}
          </div>))}
      </div>
    </div>);
}
//# sourceMappingURL=files-changed.js.map