import { useState } from 'react'
import { Archive, Check, History, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { WorkspaceSession } from '@/hooks/useWorkspaces'

interface SessionSwitcherProps {
  sessions: WorkspaceSession[]
  activeSessionId: string | null
  workspaceTitle: string | null
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onOpenChange?: (open: boolean) => void
  showTitle?: boolean
  triggerLabel?: string | null
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString()
}

export function SessionSwitcher({
  sessions,
  activeSessionId,
  workspaceTitle,
  onSelectSession,
  onNewSession,
  onOpenChange,
  showTitle = true,
  triggerLabel = null,
}: SessionSwitcherProps) {
  const [open, setOpen] = useState(false)
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  return (
    <div className={showTitle
      ? 'flex min-w-0 flex-1 items-center justify-between gap-1.5'
      : 'flex items-center gap-1.5'}>
      {showTitle ? (
        <span className="min-w-0 truncate text-sm font-semibold leading-tight">
          {activeSession?.name && activeSession.name !== 'New Chat' ? activeSession.name : ''}
        </span>
      ) : (
        null
      )}

      {/* Sessions button */}
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size={triggerLabel ? 'sm' : 'icon'}
                className={triggerLabel
                  ? 'h-7 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground'
                  : 'h-6 w-6 shrink-0 rounded-md text-muted-foreground hover:text-foreground'}
              >
                <History className="h-3.5 w-3.5" />
                {triggerLabel ? <span>{triggerLabel}</span> : null}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{triggerLabel ?? 'Sessions'}</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="start" className="w-[min(28rem,calc(100vw-1rem))] p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div>
              <div className="text-sm font-medium">Sessions</div>
              <div className="text-xs text-muted-foreground">
                {workspaceTitle || 'Current workspace'}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                onNewSession()
                setOpen(false)
              }}
            >
              <MessageSquarePlus className="mr-1 h-3 w-3" />
              New chat
            </Button>
          </div>
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-2">
            {sessions.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No sessions yet.
              </div>
            ) : (
              <div className="space-y-0.5">
                {sessions.map((session) => {
                  const isActive = session.id === activeSessionId
                  return (
                    <button
                      key={session.id}
                      type="button"
                      className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                        isActive ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        onSelectSession(session.id)
                        setOpen(false)
                      }}
                    >
                      {isActive ? (
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      ) : (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium">
                            {session.name || 'Untitled'}
                          </span>
                          {session.status === 'archived' && (
                            <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-2xs text-muted-foreground">
                              <Archive className="h-2.5 w-2.5" />
                              Archived
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-muted-foreground">
                          {formatTime(session.lastActiveAt)}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
