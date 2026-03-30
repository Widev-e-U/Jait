import { useMemo } from 'react'
import { Folder, FolderOpen, FolderInput, Monitor, Plus, Smartphone, Globe, Archive, WifiOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { WorkspaceRecord } from '@/hooks/useWorkspaces'
import type { SessionInfo } from '@/hooks/useChat'
import type { FsNode } from '@jait/shared'
import { buildWorkspaceDragPayload, JAIT_WORKSPACE_REF_MIME } from '@/lib/jait-dnd'

interface SessionSelectorProps {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  loading?: boolean
  hasMoreWorkspaces?: boolean
  showFewerWorkspaces?: boolean
  onSelectWorkspace: (workspaceId: string) => void
  onCreateWorkspace: () => void
  onRemoveWorkspace: (workspaceId: string) => void
  onChangeDirectory: (workspaceId: string) => void
  onShowMore?: () => void
  onShowFewer?: () => void
  sessionInfo?: SessionInfo | null
  nodes?: FsNode[]
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
  activeWorkspaceId,
  loading = false,
  hasMoreWorkspaces = false,
  showFewerWorkspaces = false,
  onSelectWorkspace,
  onCreateWorkspace,
  onRemoveWorkspace,
  onChangeDirectory,
  onShowMore,
  onShowFewer,
  sessionInfo,
  nodes = [],
}: SessionSelectorProps) {
  // Derive online node IDs from the nodes prop (already fetched by App.tsx)
  const onlineNodeIds = useMemo(
    () => new Set(nodes.filter((n) => !n.isGateway).map((n) => n.id)),
    [nodes],
  )

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
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : workspaces.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No workspaces yet.
              <br />
              <button onClick={onCreateWorkspace} className="underline underline-offset-2 hover:text-foreground mt-1 inline-block">
                Choose workspace folder
              </button>
            </p>
          ) : (
            <>
              {workspaces.map((workspace) => {
                const isActiveWorkspace = workspace.id === activeWorkspaceId
                const remoteNode = workspace.nodeId && workspace.nodeId !== 'gateway'
                  ? nodes.find((n) => n.id === workspace.nodeId)
                  : null
                const offline = isNodeOffline(workspace.nodeId, onlineNodeIds)
                return (
                  <div key={workspace.id} className={`rounded-md border border-border/60 bg-background/40 ${offline ? 'opacity-50' : ''}`}>
                    <div
                      className={`group flex items-start gap-1.5 rounded-md px-1.5 py-1.5 transition-colors text-sm ${
                        offline || isActiveWorkspace ? 'cursor-default' : 'cursor-pointer'
                      } ${
                        isActiveWorkspace ? 'bg-secondary/70' : offline ? '' : 'hover:bg-muted/40'
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
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">
                          {workspace.title || 'Untitled Workspace'}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="truncate min-w-0">{workspace.rootPath || 'No folder linked'}</span>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0">{formatTime(workspace.lastActiveAt)}</span>
                        </div>
                        {offline && (
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-orange-500">
                            <WifiOff className="h-2.5 w-2.5" />
                            <span>Node offline</span>
                          </div>
                        )}
                        {remoteNode && !offline && (
                          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px]">
                            <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-muted-foreground">
                              <NodeIcon platform={remoteNode.platform} />
                              <span className="truncate max-w-[80px]">{remoteNode.name}</span>
                            </span>
                          </div>
                        )}
                        {isActiveWorkspace && sessionInfo && (
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
                      <div className="flex shrink-0 self-start gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
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
                              className="h-6 w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
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
