import { Plus, Archive, Check, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Session } from '@/hooks/useSessions'
import type { SessionInfo } from '@/hooks/useChat'

interface SessionSelectorProps {
  sessions: Session[]
  activeSessionId: string | null
  hasMoreSessions?: boolean
  showFewerSessions?: boolean
  onSelect: (sessionId: string) => void
  onCreate: () => void
  onArchive: (sessionId: string) => void
  onShowMore?: () => void
  onShowFewer?: () => void
  /** Info about the currently active session's execution context. */
  sessionInfo?: SessionInfo | null
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return d.toLocaleDateString()
}

export function SessionSelector({
  sessions,
  activeSessionId,
  hasMoreSessions = false,
  showFewerSessions = false,
  onSelect,
  onCreate,
  onArchive,
  onShowMore,
  onShowFewer,
  sessionInfo,
}: SessionSelectorProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Sessions
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCreate}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New session</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No sessions yet.
              <br />
              <button onClick={onCreate} className="underline underline-offset-2 hover:text-foreground mt-1 inline-block">
                Create one
              </button>
            </p>
          ) : (
            <>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors text-sm ${
                    session.id === activeSessionId
                      ? 'bg-secondary text-secondary-foreground'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => onSelect(session.id)}
                >
                  {session.id === activeSessionId && (
                    <Check className="h-3 w-3 shrink-0 text-primary" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-medium">
                      {session.name || 'Untitled'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatTime(session.lastActiveAt)}
                    </div>
                    {session.id === activeSessionId && sessionInfo && (
                      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-blue-500">
                        <span className="truncate">{sessionInfo.provider}</span>
                        <span className="shrink-0 text-muted-foreground">·</span>
                        <Monitor className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">
                          {sessionInfo.isRemote && sessionInfo.remoteNode
                            ? sessionInfo.remoteNode.nodeName
                            : 'Gateway'}
                        </span>
                      </div>
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start"
                        onClick={(e) => {
                          e.stopPropagation()
                          onArchive(session.id)
                        }}
                      >
                        <Archive className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Archive</TooltipContent>
                  </Tooltip>
                </div>
              ))}
              {hasMoreSessions && onShowMore && (
                <button
                  className="w-full px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={onShowMore}
                >
                  Show more sessions
                </button>
              )}
              {showFewerSessions && onShowFewer && (
                <button
                  className="w-full px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={onShowFewer}
                >
                  Show fewer sessions
                </button>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
