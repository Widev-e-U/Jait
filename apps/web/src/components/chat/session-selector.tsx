import { useMemo, useState } from 'react'
import { Folder, FolderOpen, FolderInput, Monitor, Plus, Smartphone, Globe, Archive, WifiOff, Loader2, MessageSquare, GitBranch, Search, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import type { ProjectRecord, ProjectSession } from '@/hooks/useProjects'
import type { SessionInfo } from '@/hooks/useChat'
import type { FsNode } from '@jait/shared'
import { buildProjectDragPayload, JAIT_PROJECT_REF_MIME } from '@/lib/jait-dnd'
import type { AutomationRepository } from '@/lib/automation-repositories'
import { getLatestProjectSessionId } from '@/lib/project-sessions'
import { getProjectRepository } from '@/lib/project-repositories'

interface SessionSelectorProps {
  projects: ProjectRecord[]
  personalSessions?: ProjectSession[]
  activeProjectId: string | null
  activeSessionId?: string | null
  loading?: boolean
  hasMoreProjects?: boolean
  showFewerProjects?: boolean
  onSelectProject: (projectId: string) => void
  onSelectProjectSession?: (projectId: string, sessionId: string) => void
  onSelectPersonalSession?: (sessionId: string) => void
  onNewPersonalSession?: () => void
  onCreateProject: () => void
  onRemoveProject: (projectId: string) => void
  onChangeDirectory: (projectId: string) => void
  onAssignRepository?: (projectId: string) => void
  onShowMore?: () => void
  onShowFewer?: () => void
  /** Called on any project/session row click, even if it's already active (e.g. to close a mobile drawer). */
  onDismiss?: () => void
  /** IDs of sessions currently generating a response — rendered with a loading spinner. */
  streamingSessionIds?: Set<string>
  sessionInfo?: SessionInfo | null
  nodes?: FsNode[]
  repositories?: AutomationRepository[]
}

const RECENT_SESSIONS_LIMIT = 5

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
  projects,
  personalSessions = [],
  activeProjectId,
  activeSessionId,
  loading = false,
  hasMoreProjects = false,
  showFewerProjects = false,
  onSelectProject,
  onSelectProjectSession,
  onSelectPersonalSession,
  onNewPersonalSession,
  onCreateProject,
  onRemoveProject,
  onChangeDirectory,
  onAssignRepository,
  onShowMore,
  onShowFewer,
  onDismiss,
  streamingSessionIds,
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

  const filteredProjects = useMemo(() => {
    if (!normalizedSearchQuery) return projects
    return projects.filter((project) => {
      const repository = getProjectRepository(project, repositories)
      const remoteNode = project.nodeId && project.nodeId !== 'gateway'
        ? nodes.find((n) => n.id === project.nodeId)
        : null
      const terms = [
        project.title,
        project.rootPath,
        repository?.name,
        remoteNode?.name,
        ...project.sessions.flatMap((session) => [session.name, session.projectPath]),
      ]
      return terms.some((term) => term?.toLowerCase().includes(normalizedSearchQuery))
    })
  }, [nodes, normalizedSearchQuery, repositories, projects])

  const filteredPersonalSessions = useMemo(() => {
    if (!normalizedSearchQuery) return personalSessions
    return personalSessions.filter((session) => (
      [session.name, session.projectPath]
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
            placeholder="Search chats and projects"
            aria-label="Search chats and projects"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-md p-1" onClick={onCreateProject}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New project</TooltipContent>
        </Tooltip>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Top half: Projects ──────────────────────────── */}
          <div className="flex max-h-[50%] min-h-0 shrink-0 flex-col border-b">
            <div className="flex h-8 shrink-0 items-center px-3 text-left transition-colors hover:bg-muted/30">
              <span className="text-2xs font-medium text-muted-foreground">Projects</span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-0.5 px-1.5 pb-1.5">
                {projects.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No projects yet.
                    <br />
                    <button onClick={onCreateProject} className="underline underline-offset-2 hover:text-foreground mt-1 inline-block">
                      Choose project folder
                    </button>
                  </p>
                )}
                {projects.length > 0 && filteredProjects.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No matching projects.
                  </p>
                )}
                {filteredProjects.map((project) => {
                  const isActiveProject = project.id === activeProjectId
                  const latestSessionId = getLatestProjectSessionId(project)
                  const isLatestProjectSessionActive = isActiveProject && latestSessionId === activeSessionId
                  const remoteNode = project.nodeId && project.nodeId !== 'gateway'
                    ? nodes.find((n) => n.id === project.nodeId)
                    : null
                  const offline = isNodeOffline(project.nodeId, onlineNodeIds)
                  const repository = getProjectRepository(project, repositories)
                  const recentSessions = [...project.sessions]
                    .sort((a, b) => (
                      Date.parse(b.lastActiveAt || b.createdAt) - Date.parse(a.lastActiveAt || a.createdAt)
                    ))
                    .slice(0, RECENT_SESSIONS_LIMIT)
                  return (
                    <div key={project.id}>
                    <div
                      className={`group grid w-full grid-cols-[auto,minmax(0,1fr),auto] items-start gap-1.5 px-1.5 py-1.5 text-sm transition-colors ${
                        offline || isLatestProjectSessionActive ? 'cursor-default' : 'cursor-pointer'
                      } ${
                        isActiveProject ? 'rounded-md bg-secondary/70' : offline ? 'opacity-50' : 'hover:rounded-md hover:bg-muted/40'
                      }`}
                      draggable={Boolean(project.rootPath)}
                      onDragStart={(e) => {
                        if (!project.rootPath) {
                          e.preventDefault()
                          return
                        }
                        e.dataTransfer.effectAllowed = 'copy'
                        e.dataTransfer.setData(
                          JAIT_PROJECT_REF_MIME,
                          JSON.stringify(buildProjectDragPayload(project.rootPath, project.title || undefined)),
                        )
                      }}
                      onClick={() => {
                        onDismiss?.()
                        if (!offline && !isLatestProjectSessionActive) onSelectProject(project.id)
                      }}
                    >
                      {isActiveProject ? (
                        <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <Folder className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 overflow-hidden">
                        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                          <span className="min-w-0 truncate text-xs font-medium">
                            {project.title || 'Untitled Project'}
                          </span>
                          {repository && (
                            <>
                              <span className="shrink-0 text-2xs text-muted-foreground">·</span>
                              <span className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
                                <GitBranch className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{repository.name}</span>
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex min-w-0 items-center gap-1 overflow-hidden text-2xs text-muted-foreground">
                          <span className="min-w-0 truncate">{project.rootPath || 'No folder linked'}</span>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0">{formatTime(project.lastActiveAt)}</span>
                        </div>
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
                        {isActiveProject && sessionInfo && (
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
                      <div className="mt-0.5 flex shrink-0 self-start">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Project actions"
                              className="h-6 w-6 shrink-0 text-muted-foreground transition-opacity hover:text-foreground data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="right" className="min-w-[10rem]">
                            {onAssignRepository && (
                              <DropdownMenuItem
                                disabled={!project.rootPath}
                                className={`gap-2 ${repository ? 'text-primary focus:text-primary' : ''}`}
                                onSelect={(e) => {
                                  e.preventDefault()
                                  onAssignRepository(project.id)
                                }}
                              >
                                <GitBranch className="h-3.5 w-3.5" />
                                <span>{repository ? `Repository: ${repository.name}` : 'Assign repository'}</span>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="gap-2"
                              onSelect={(e) => {
                                e.preventDefault()
                                onChangeDirectory(project.id)
                              }}
                            >
                              <FolderInput className="h-3.5 w-3.5" />
                              <span>Change directory</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 text-destructive focus:text-destructive"
                              onSelect={(e) => {
                                e.preventDefault()
                                onRemoveProject(project.id)
                              }}
                            >
                              <Archive className="h-3.5 w-3.5" />
                              <span>Archive project</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {recentSessions.length > 0 && (
                      <div className="ml-[22px] space-y-0.5 border-l pl-1.5">
                        {recentSessions.map((session) => {
                          const isActiveSession = isActiveProject && session.id === activeSessionId
                          const isStreaming = streamingSessionIds?.has(session.id) ?? false
                          return (
                            <div
                              key={session.id}
                              className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm transition-colors ${
                                isActiveSession ? 'bg-secondary/70 cursor-default' : 'cursor-pointer hover:bg-muted/40'
                              }`}
                              onClick={() => {
                                onDismiss?.()
                                if (!isActiveSession) onSelectProjectSession?.(project.id, session.id)
                              }}
                            >
                              {isStreaming ? (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                              ) : (
                                <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActiveSession ? 'text-primary' : 'text-muted-foreground'}`} />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-medium">
                                  {session.name || 'Untitled session'}
                                </div>
                              </div>
                              <span className="shrink-0 text-2xs text-muted-foreground">
                                {formatTime(session.lastActiveAt || session.createdAt)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    </div>
                  )
                })}
                {!normalizedSearchQuery && hasMoreProjects && onShowMore && (
                  <button
                    className="w-full px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={onShowMore}
                  >
                    Show more projects
                  </button>
                )}
                {!normalizedSearchQuery && showFewerProjects && onShowFewer && (
                  <button
                    className="w-full px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={onShowFewer}
                  >
                    Show fewer projects
                  </button>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* ── Bottom half: Personal chats ───────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-8 shrink-0 items-center justify-between px-3">
              <div className="flex min-w-0 flex-1 items-center text-left transition-colors hover:text-foreground">
                <span className="text-2xs font-medium text-muted-foreground">Personal chats</span>
              </div>
              {onNewPersonalSession && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="ml-1 h-6 w-6 rounded-md p-1" onClick={onNewPersonalSession}>
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
                  const isActive = activeProjectId === null && session.id === activeSessionId
                  const isStreaming = streamingSessionIds?.has(session.id) ?? false
                  return (
                    <div
                      key={session.id}
                      className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors text-sm ${
                        isActive ? 'bg-secondary/70 cursor-default' : 'cursor-pointer hover:bg-muted/40'
                      }`}
                      onClick={() => {
                        onDismiss?.()
                        if (!isActive && onSelectPersonalSession) onSelectPersonalSession(session.id)
                      }}
                    >
                      {isStreaming ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      ) : (
                        <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
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
