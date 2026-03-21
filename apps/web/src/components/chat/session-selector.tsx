import { Archive, Check, Folder, FolderOpen, MessageSquarePlus, Monitor, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { WorkspaceRecord } from '@/hooks/useWorkspaces'
import type { SessionInfo } from '@/hooks/useChat'

interface SessionSelectorProps {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  activeSessionId: string | null
  hasMoreWorkspaces?: boolean
  showFewerWorkspaces?: boolean
  onSelectWorkspace: (workspaceId: string) => void
  onSelectSession: (workspaceId: string, sessionId: string) => void
  onCreateWorkspace: () => void
  onCreateSession: (workspaceId: string) => void
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
  workspaces,
  activeWorkspaceId,
  activeSessionId,
  hasMoreWorkspaces = false,
  showFewerWorkspaces = false,
  onSelectWorkspace,
  onSelectSession,
  onCreateWorkspace,
  onCreateSession,
  onArchive,
  onShowMore,
  onShowFewer,
  sessionInfo,
}: SessionSelectorProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-[35px] shrink-0 items-center justify-between px-3 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Workspaces
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCreateWorkspace}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New workspace</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {workspaces.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No workspaces yet.
              <br />
              <button onClick={onCreateWorkspace} className="underline underline-offset-2 hover:text-foreground mt-1 inline-block">
                Create workspace
              </button>
            </p>
          ) : (
            <>
              {workspaces.map((workspace) => {
                const isActiveWorkspace = workspace.id === activeWorkspaceId
                return (
                  <div key={workspace.id} className="rounded-md border border-border/60 bg-background/40">
                    <div
                      className={`group flex items-start gap-2 rounded-md px-2 py-2 cursor-pointer transition-colors text-sm ${
                        isActiveWorkspace ? 'bg-secondary/70' : 'hover:bg-muted/40'
                      }`}
                      onClick={() => onSelectWorkspace(workspace.id)}
                    >
                      {isActiveWorkspace ? (
                        <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <Folder className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">
                          {workspace.title || 'Untitled Workspace'}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {workspace.rootPath || 'No folder linked'}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {workspace.sessions.length} {workspace.sessions.length === 1 ? 'session' : 'sessions'} · {formatTime(workspace.lastActiveAt)}
                        </div>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start"
                            onClick={(e) => {
                              e.stopPropagation()
                              onCreateSession(workspace.id)
                            }}
                          >
                            <MessageSquarePlus className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">New session</TooltipContent>
                      </Tooltip>
                    </div>

                    {isActiveWorkspace && (
                      <div className="pb-1">
                        {workspace.sessions.length === 0 ? (
                          <button
                            className="mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                            onClick={() => onCreateSession(workspace.id)}
                          >
                            <MessageSquarePlus className="h-3 w-3 shrink-0" />
                            Start first session
                          </button>
                        ) : workspace.sessions.map((session) => (
                          <div
                            key={session.id}
                            className={`group mx-2 flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors text-sm ${
                              session.id === activeSessionId
                                ? 'bg-secondary text-secondary-foreground'
                                : 'hover:bg-muted/40'
                            }`}
                            onClick={() => onSelectSession(workspace.id, session.id)}
                          >
                            {session.id === activeSessionId ? (
                              <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                            ) : (
                              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
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
                        ))
                        }
                      </div>
                    )}
                  </div>
                )
              })}
              {hasMoreWorkspaces && onShowMore && (
                <button
                  className="w-full px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={onShowMore}
                >
                  Show more workspaces
                </button>
              )}
              {showFewerWorkspaces && onShowFewer && (
                <button
                  className="w-full px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={onShowFewer}
                >
                  Show fewer workspaces
                </button>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
