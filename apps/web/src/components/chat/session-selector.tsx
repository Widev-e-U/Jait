import { useMemo, useState } from 'react'
import { Folder, FolderOpen, FolderInput, Monitor, Plus, Smartphone, Globe, Archive, WifiOff, Loader2, MessageSquare, GitBranch, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { WorkspaceRecord, WorkspaceSession } from '@/hooks/useWorkspaces'
import type { SessionInfo } from '@/hooks/useChat'
import type { FsNode } from '@jait/shared'
import { buildWorkspaceDragPayload, JAIT_WORKSPACE_REF_MIME } from '@/lib/jait-dnd'
import type { AutomationRepository } from '@/lib/automation-repositories'
import { getWorkspaceRepository } from '@/lib/workspace-repositories'

interface SessionSelectorProps {
  workspaces: WorkspaceRecord[]
  personalSessions?: WorkspaceSession[]
  activeWorkspaceId: string | null
  activeSessionId?: string | null
  loading?: boolean
  hasMoreWorkspaces?: boolean
  showFewerWorkspaces?: boolean
  onSelectWorkspace: (workspaceId: string) => void
  onSelectPersonalSession?: (sessionId: string) => void
  onNewPersonalSession?: () => void
  onCreateWorkspace: () => void
  onRemoveWorkspace: (workspaceId: string) => void
  onChangeDirectory: (workspaceId: string) => void
  onAssignRepository?: (workspaceId: string) => void
  onShowMore?: () => void
  onShowFewer?: () => void
  sessionInfo?: SessionInfo | null
  nodes?: FsNode[]
  repositories?: AutomationRepository[]
}

function isNodeOffline(nodeId: string | null, onlineNodeIds: Set<string>): boolean {
  if (!nodeId || nodeId === 'gateway') return false
  return !onlineNodeIds.has(nodeId)
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

function NodeIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'windows':
    case 'macos':
    case 'linux':
      return <Monitor className="h-2.5 w-2.5" />
    case 'android':
    case 'ios':
      return <Smartphone className="h-2.5 w-2.5" />
    default:
      return <Globe className="h-2.5 w-2.5" />
  }
}

export function SessionSelector({
  workspaces,
  personalSessions = [],
  activeWorkspaceId,
  activeSessionId,
  loading = false,
  hasMoreWorkspaces = false,
  showFewerWorkspaces = false,
  onSelectWorkspace,
  onSelectPersonalSession,
  onNewPersonalSession,
  onCreateWorkspace,
  onRemoveWorkspace,
  onChangeDirectory,
  onAssignRepository,
  onShowMore,
  onShowFewer,
  sessionInfo,
  nodes = [],
  repositories = [],
}: SessionSelectorProps) {
  // Derive online node IDs from the nodes prop (already fetched by App.tsx)
  const onlineNodeIds = useMemo(
    () => new Set(nodes.filter((n) => !n.isGateway).map((n) => n.id)),
    [nodes],
  )
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const filteredWorkspaces = useMemo(() => {
    if (!normalizedSearchQuery) return workspaces
    return workspaces.filter((workspace) => {
      const repository = getWorkspaceRepository(workspace, repositories)
      const remoteNode = workspace.nodeId && workspace.nodeId !== 'gateway'
        ? nodes.find((n) => n.id === workspace.nodeId)
        : null
      const terms = [
        workspace.title,
        workspace.rootPath,
        repository?.name,
        remoteNode?.name,
        ...workspace.sessions.flatMap((session) => [session.name, session.workspacePath]),
      ]
      return terms.some((term) => term?.toLowerCase().includes(normalizedSearchQuery))
    })
  }, [nodes, normalizedSearchQuery, repositories, workspaces])

  const filteredPersonalSessions = useMemo(() => {
    if (!normalizedSearchQuery) return personalSessions
    return personalSessions.filter((session) => (
      [session.name, session.workspacePath]
        .some((term) => term?.toLowerCase().includes(normalizedSearchQuery))
    ))
  }, [normalizedSearchQuery, personalSessions])

  return (
    <div className="flex flex-col h-full">
      <div className="flex h-[35px] shrink-0 items-center gap-2 px-2.5 border-b">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search chats and workspaces"
            aria-label="Search chats and workspaces"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onCreateWorkspace}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New workspace</TooltipContent>
        </Tooltip>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Top half: Workspaces ──────────────────────────── */}
          <div className="flex max-h-[50%] min-h-0 shrink-0 flex-col border-b">
            <div className="flex h-7 shrink-0 items-center justify-between px-3">
              <span className="text-2xs font-medium text-muted-foreground">Workspaces</span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-0.5 px-1.5 pb-1.5">
                {workspaces.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No workspaces yet.
                    <br />
                    <button onClick={onCreateWorkspace} className="underline underline-offset-2 hover:text-foreground mt-1 inline-block">
                      Choose workspace folder
                    </button>
                  </p>
                )}
                {workspaces.length > 0 && filteredWorkspaces.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No matching workspaces.
                  </p>
                )}
                {filteredWorkspaces.map((workspace) => {
                  const isActiveWorkspace = workspace.id === activeWorkspaceId
                  const remoteNode = workspace.nodeId && workspace.nodeId !== 'gateway'
                    ? nodes.find((n) => n.id === workspace.nodeId)
                    : null
                  const offline = isNodeOffline(workspace.nodeId, onlineNodeIds)
                  const repository = getWorkspaceRepository(workspace, repositories)
                  return (
                    <div
                      key={workspace.id}
                      className={`group grid w-full grid-cols-[auto,minmax(0,1fr),auto] items-start gap-1.5 px-1.5 py-1.5 text-sm transition-colors ${
                        offline || isActiveWorkspace ? 'cursor-default' : 'cursor-pointer'
                      } ${
                        isActiveWorkspace ? 'rounded-md bg-secondary/70' : offline ? 'opacity-50' : 'hover:rounded-md hover:bg-muted/40'
                      }`}
                      draggable={Boolean(workspace.rootPath)}
                      onDragStart={(e) => {
                        if (!workspace.rootPath) {
                          e.preventDefault()
                          return
                        }
                        e.dataTransfer.effectAllowed = 'copy'
                        e.dataTransfer.setData(
                          JAIT_WORKSPACE_REF_MIME,
                          JSON.stringify(buildWorkspaceDragPayload(workspace.rootPath, workspace.title || undefined)),
                        )
                      }}
                      onClick={() => { if (!offline && !isActiveWorkspace) onSelectWorkspace(workspace.id) }}
                    >
                      {isActiveWorkspace ? (
                        <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <Folder className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 overflow-hidden">
                        <div className="truncate text-xs font-medium">
                          {workspace.title || 'Untitled Workspace'}
                        </div>
                        <div className="flex min-w-0 items-center gap-1 overflow-hidden text-2xs text-muted-foreground">
                          <span className="min-w-0 truncate">{workspace.rootPath || 'No folder linked'}</span>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0">{formatTime(workspace.lastActiveAt)}</span>
                        </div>
                        {repository && (
                          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
                            <GitBranch className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{repository.name}</span>
                          </div>
                        )}
                        {offline && (
                          <div className="mt-0.5 flex items-center gap-1 text-2xs text-orange-500">
                            <WifiOff className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">Node offline</span>
                          </div>
                        )}
                        {remoteNode && !offline && (
                          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs">
                            <span className="inline-flex max-w-full items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-muted-foreground">
                              <NodeIcon platform={remoteNode.platform} />
                              <span className="truncate max-w-[80px]">{remoteNode.name}</span>
                            </span>
                          </div>
                        )}
                        {isActiveWorkspace && sessionInfo && (
                          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs text-blue-500">
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
                      <div className="flex shrink-0 self-start gap-0.5">
                        {onAssignRepository && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={repository ? `Repository: ${repository.name}` : 'Assign repository'}
                                disabled={!workspace.rootPath}
                                className={`h-5.5 w-5.5 shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 ${
                                  repository ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onAssignRepository(workspace.id)
                                }}
                              >
                                <GitBranch className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">{repository ? `Repository: ${repository.name}` : 'Assign repository'}</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Change directory"
                              className="h-5.5 w-5.5 shrink-0 opacity-100 text-muted-foreground transition-opacity hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation()
                                onChangeDirectory(workspace.id)
                              }}
                            >
                              <FolderInput className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="right">Change directory</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Archive workspace"
                              className="h-5.5 w-5.5 shrink-0 opacity-100 text-muted-foreground transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveWorkspace(workspace.id)
                              }}
                            >
                              <Archive className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="right">Archive workspace</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  )
                })}
                {!normalizedSearchQuery && hasMoreWorkspaces && onShowMore && (
                  <button
                    className="w-full px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={onShowMore}
                  >
                    Show more workspaces
                  </button>
                )}
                {!normalizedSearchQuery && showFewerWorkspaces && onShowFewer && (
                  <button
                    className="w-full px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={onShowFewer}
                  >
                    Show fewer workspaces
                  </button>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* ── Bottom half: Personal chats ───────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-7 shrink-0 items-center justify-between px-3">
              <span className="text-2xs font-medium text-muted-foreground">Personal chats</span>
              {onNewPersonalSession && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onNewPersonalSession}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">New personal chat</TooltipContent>
                </Tooltip>
              )}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-0.5 px-1.5 pb-1.5">
                {personalSessions.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No personal chats yet.
                    {onNewPersonalSession && (
                      <>
                        <br />
                        <button onClick={onNewPersonalSession} className="underline underline-offset-2 hover:text-foreground mt-1 inline-block">
                          Start a chat
                        </button>
                      </>
                    )}
                  </p>
                )}
                {personalSessions.length > 0 && filteredPersonalSessions.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No matching personal chats.
                  </p>
                )}
                {filteredPersonalSessions.map((session) => {
                  const isActive = activeWorkspaceId === null && session.id === activeSessionId
                  return (
                    <div
                      key={session.id}
                      className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors text-sm ${
                        isActive ? 'bg-secondary/70 cursor-default' : 'cursor-pointer hover:bg-muted/40'
                      }`}
                      onClick={() => { if (!isActive && onSelectPersonalSession) onSelectPersonalSession(session.id) }}
                    >
                      <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">
                          {session.name || 'Personal chat'}
                        </div>
                        <div className="text-2xs text-muted-foreground">
                          {formatTime(session.lastActiveAt ?? session.createdAt)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  )
}
