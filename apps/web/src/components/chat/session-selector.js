import { Plus, Archive, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000)
        return 'just now';
    if (diff < 3600_000)
        return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000)
        return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString();
}
export function SessionSelector({ sessions, activeSessionId, onSelect, onCreate, onArchive, }) {
    return (<div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Sessions
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCreate}>
              <Plus className="h-3.5 w-3.5"/>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New session</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {sessions.length === 0 ? (<p className="text-xs text-muted-foreground text-center py-4">
              No sessions yet.
              <br />
              <button onClick={onCreate} className="underline underline-offset-2 hover:text-foreground mt-1 inline-block">
                Create one
              </button>
            </p>) : (sessions.map((session) => (<div key={session.id} className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors text-sm ${session.id === activeSessionId
                ? 'bg-secondary text-secondary-foreground'
                : 'hover:bg-muted/50'}`} onClick={() => onSelect(session.id)}>
                {session.id === activeSessionId && (<Check className="h-3 w-3 shrink-0 text-primary"/>)}
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs font-medium">
                    {session.name || 'Untitled'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatTime(session.lastActiveAt)}
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => {
                e.stopPropagation();
                onArchive(session.id);
            }}>
                      <Archive className="h-3 w-3"/>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Archive</TooltipContent>
                </Tooltip>
              </div>)))}
        </div>
      </ScrollArea>
    </div>);
}
//# sourceMappingURL=session-selector.js.map