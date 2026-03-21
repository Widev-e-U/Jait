import { useState } from 'react'
import { Archive, Check, ChevronDown, Folder, MessageSquarePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { WorkspaceRecord, WorkspaceSession } from '@/hooks/useWorkspaces'

interface SessionSwitcherProps {
  workspaces: WorkspaceRecord[]
  archivedSessionsByWorkspace: Record<string, WorkspaceSession[]>
  activeWorkspaceId: string | null
  activeSessionId: string | null
  onSelectWorkspace: (workspaceId: string) => void
  onSelectSession: (workspaceId: string, sessionId: string) => void
  onCreateWorkspace: () => void
  onCreateSession: (workspaceId?: string | null) => void
  onRemoveWorkspace: (workspaceId: string) => void
  onOpenChange?: (open: boolean) => void
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

function dedupeSessions(active: WorkspaceSession[], archived: WorkspaceSession[]) {
  const seen = new Set<string>()
  return [...active, ...archived]
    .filter((session) => {
      if (seen.has(session.id)) return false
      seen.add(session.id)
      return true
    })
    .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
}

export function SessionSwitcher({
  workspaces,
  archivedSessionsByWorkspace,
  activeWorkspaceId,
  activeSessionId,
  onSelectWorkspace,
  onSelectSession,
  onCreateWorkspace,
  onCreateSession,
  onRemoveWorkspace,
  onOpenChange,
}: SessionSwitcherProps) {
  const [open, setOpen] = useState(false)
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0] ?? null
  const activeSessions = activeWorkspace ? dedupeSessions(
    activeWorkspace.sessions,
    archivedSessionsByWorkspace[activeWorkspace.id] ?? [],
  ) : []
  const activeSession = activeSessions.find((session) => session.id === activeSessionId) ?? activeSessions[0] ?? null
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 max-w-full justify-between gap-2 rounded-lg px-3 text-left">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">
              {activeSession?.name || 'New chat'}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {activeWorkspace?.title || 'No workspace selected'}
            </div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(28rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div>
            <div className="text-sm font-medium">Chats</div>
            <div className="text-[11px] text-muted-foreground">
              Switch sessions inside each workspace.
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => {
              onCreateWorkspace()
              setOpen(false)
            }}>
              <Folder className="mr-1 h-3 w-3" />
              Workspace
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => {
              onCreateSession(activeWorkspaceId)
              setOpen(false)
            }}>
              <MessageSquarePlus className="mr-1 h-3 w-3" />
              Session
            </Button>
          </div>
        </div>
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-2">
          {workspaces.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No workspaces yet.
            </div>
          ) : (
            <div className="space-y-2">
              {workspaces.map((workspace) => {
                const archivedSessions = archivedSessionsByWorkspace[workspace.id] ?? []
                const sessions = dedupeSessions(workspace.sessions, archivedSessions)
                const isActiveWorkspace = workspace.id === activeWorkspaceId
                const canRemoveWorkspace = sessions.length === 0

                return (
                  <div key={workspace.id} className="rounded-lg border border-border/70 bg-background/60">
                    <div className="flex items-start gap-2 px-3 py-2">
                      <button
                        type="button"
                        className={`min-w-0 flex-1 rounded-md px-1 py-0.5 text-left transition-colors ${
                          isActiveWorkspace ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => {
                          onSelectWorkspace(workspace.id)
                          setOpen(false)
                        }}
                      >
                        <div className="truncate text-xs font-medium">
                          {workspace.title || 'Untitled Workspace'}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {workspace.rootPath || 'No folder linked'}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => {
                          onCreateSession(workspace.id)
                          setOpen(false)
                        }}
                        title="New session"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                      </Button>
                      {canRemoveWorkspace && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            onRemoveWorkspace(workspace.id)
                            setOpen(false)
                          }}
                          title="Remove empty workspace"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="border-t border-border/60 px-2 py-1.5">
                      {sessions.length === 0 ? (
                        <div className="px-2 py-2 text-[11px] text-muted-foreground">
                          No sessions yet.
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {sessions.map((session) => {
                            const isActiveSession = session.id === activeSessionId
                            return (
                              <button
                                key={session.id}
                                type="button"
                                className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                                  isActiveSession ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted/50'
                                }`}
                                onClick={() => {
                                  onSelectSession(workspace.id, session.id)
                                  setOpen(false)
                                }}
                              >
                                {isActiveSession ? (
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
                                      <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[9px] text-muted-foreground">
                                        <Archive className="h-2.5 w-2.5" />
                                        Archived
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {formatTime(session.lastActiveAt)}
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
