import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Folder, FolderOpen, FolderInput, FolderX, Monitor, Plus, Smartphone, Globe, Archive, WifiOff, Loader2, MessageSquare, GitBranch, Search, MoreVertical, ChevronRight, ChevronDown, FolderPlus, Settings2, CornerUpLeft, Code } from 'lucide-react'
import { buildProjectTree, flattenProjectTree, validateProjectMove } from '@jait/shared'
import { ProjectColorDot } from '@/components/project/project-color-picker'
import { getSessionContextMenuHeight, SessionContextMenu } from '@/components/chat/session-context-menu'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { getProjectMoveTargets } from '@/components/project/project-move-targets'
import type { ProjectRecord, ProjectSearchResults, ProjectSession } from '@/hooks/useProjects'
import type { SessionInfo } from '@/hooks/useChat'
import type { FsNode } from '@jait/shared'
import { buildChatDragPayload, buildProjectDragPayload, JAIT_CHAT_REF_MIME, JAIT_PROJECT_REF_MIME, setDragImageChip } from '@/lib/jait-dnd'
import type { AutomationRepository } from '@/lib/automation-repositories'
import { getLatestProjectSessionId } from '@/lib/project-sessions'
import { getProjectRepository } from '@/lib/project-repositories'
import { SessionChatIcon } from '@/components/chat/session-chat-icon'
import { useIsMobile } from '@/hooks/useIsMobile'

interface SessionSelectorProps {
  projects: ProjectRecord[]
  personalSessions?: ProjectSession[]
  activeProjectId: string | null
  activeSessionId?: string | null
  loading?: boolean
  hasMoreProjects?: boolean
  showFewerProjects?: boolean
  searchResults?: ProjectSearchResults | null
  searchLoading?: boolean
  onSearch?: (query: string) => void
  onSelectProject: (projectId: string) => void
  onSelectProjectSession?: (projectId: string, sessionId: string) => void
  onSelectPersonalSession?: (sessionId: string) => void
  onArchiveSession?: (sessionId: string) => void
  /** Moves a chat into a project, or back to the personal chats when null. */
  onMoveSession?: (sessionId: string, projectId: string | null) => void
  /** Finds move targets beyond the projects the sidebar has paged in. */
  onSearchProjects?: (query: string) => Promise<ProjectRecord[]>
  onNewPersonalSession?: () => void
  onCreateProject: () => void
  /** Creates a chat folder (no directory on disk), optionally nested. */
  onCreateFolder?: (parentId: string | null) => void
  /** Opens the name/description/colour/context editor. */
  onEditProject?: (projectId: string) => void
  /** Shows each project's persisted editor-mode state beside desktop project rows. */
  showEditorModeStatus?: boolean
  /**
   * Overrides mobile detection. When omitted, mobile is inferred from the
   * viewport/device via `useIsMobile()`. On desktop the 3-dot menu affordance is
   * hidden (menu reached by right-click); on touch it is kept alongside
   * long-press. Tests pass this explicitly to force a layout.
   */
  isMobile?: boolean
  /** Re-parents a folder or project; null moves it to the root. */
  onMoveProject?: (projectId: string, parentId: string | null) => void
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
const COLLAPSED_FOLDERS_STORAGE_KEY = 'jait.sidebar.collapsedFolders'
/** Per nesting level; deep enough to read, shallow enough for a 256px sidebar. */
const FOLDER_INDENT_PX = 12
/** Internal drag payload for re-parenting a folder within the sidebar. */
const JAIT_PROJECT_MOVE_MIME = 'application/x-jait-project-move'
/** Internal drag payload for moving a chat between projects / personal chats. */
const JAIT_SESSION_MOVE_MIME = 'application/x-jait-session-move'
const SESSION_CONTEXT_MENU_WIDTH = 256
const SESSION_CONTEXT_MENU_HEIGHT = 40
const SESSION_CONTEXT_MENU_MARGIN = 8
/** Touch devices have no right-click — a press this long opens the menu instead. */
const SESSION_LONG_PRESS_MS = 500
/** Project rows use the same hold-to-open gesture on touch, but reuse the timer. */
const PROJECT_LONG_PRESS_MS = SESSION_LONG_PRESS_MS

export function getSessionContextMenuPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  menuHeight: number = SESSION_CONTEXT_MENU_HEIGHT,
) {
  return {
    left: Math.max(SESSION_CONTEXT_MENU_MARGIN, Math.min(x, viewportWidth - SESSION_CONTEXT_MENU_WIDTH - SESSION_CONTEXT_MENU_MARGIN)),
    top: Math.max(SESSION_CONTEXT_MENU_MARGIN, Math.min(y, viewportHeight - menuHeight - SESSION_CONTEXT_MENU_MARGIN)),
  }
}

/**
 * Collapsed folders are a view preference, not shared state — they live in
 * localStorage so a reload keeps the sidebar looking the way the user left it
 * without a server round-trip.
 */
export function readCollapsedFolders(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_FOLDERS_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function writeCollapsedFolders(ids: Set<string>) {
  try {
    window.localStorage.setItem(COLLAPSED_FOLDERS_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    /* private mode / quota — the tree still works, it just won't persist */
  }
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

/** Which internal sidebar drag is active, if any. Data payloads are unreadable
 * during dragover, so we distinguish by the advertised MIME types instead. */
function getSidebarDragKind(types: ReadonlyArray<string>): 'session' | 'project' | null {
  if (types.includes(JAIT_SESSION_MOVE_MIME)) return 'session'
  if (types.includes(JAIT_PROJECT_MOVE_MIME)) return 'project'
  return null
}

/** True when a session has activity newer than when the user last opened it. */
function isSessionUnread(session: { lastActiveAt: string; viewedAt: string | null }): boolean {
  if (!session.viewedAt) return true
  return Date.parse(session.lastActiveAt) > Date.parse(session.viewedAt)
}

function UnreadDot() {
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
      aria-label="Unread"
      title="Unread"
    />
  )
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
  searchResults,
  searchLoading = false,
  onSearch,
  onSelectProject,
  onSelectProjectSession,
  onSelectPersonalSession,
  onArchiveSession,
  onMoveSession,
  onSearchProjects,
  onNewPersonalSession,
  onCreateProject,
  onCreateFolder,
  onEditProject,
  showEditorModeStatus = false,
  isMobile: isMobileProp,
  onMoveProject,
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
  const detectedMobile = useIsMobile()
  const isMobile = isMobileProp ?? detectedMobile
  // Derive online node IDs from the nodes prop (already fetched by App.tsx)
  const onlineNodeIds = useMemo(
    () => new Set(nodes.filter((n) => !n.isGateway).map((n) => n.id)),
    [nodes],
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleSessionsByProject, setVisibleSessionsByProject] = useState<Record<string, number>>({})
  const [visiblePersonalSessions, setVisiblePersonalSessions] = useState(RECENT_SESSIONS_LIMIT)
  const [sessionContextMenu, setSessionContextMenu] = useState<
    { sessionId: string; projectId: string | null; left: number; top: number } | null
  >(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null)
  const longPressFiredRef = useRef(false)
  // Set when the project menu was opened via right-click or long-press so the
  // click that follows (esp. on touch) doesn't also select the project.
  const projectMenuJustOpenedRef = useRef(false)
  // Tracks the chat being dragged so we can skip highlighting its own project.
  const dragSessionRef = useRef<{ sessionId: string; sourceProjectId: string | null } | null>(null)
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const displayedProjects = normalizedSearchQuery && onSearch
    ? searchResults?.projects ?? []
    : projects
  const displayedPersonalSessions = normalizedSearchQuery && onSearch
    ? searchResults?.personalSessions ?? []
    : personalSessions

  useEffect(() => {
    if (!onSearch) return
    if (!normalizedSearchQuery) {
      onSearch('')
      return
    }
    const timer = window.setTimeout(() => onSearch(searchQuery.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [normalizedSearchQuery, onSearch, searchQuery])

  const filteredProjects = useMemo(() => {
    if (!normalizedSearchQuery || onSearch) return displayedProjects
    return displayedProjects.filter((project) => {
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
  }, [displayedProjects, nodes, normalizedSearchQuery, onSearch, repositories])

  const offlineProjectIds = useMemo(
    () => new Set(projects.filter((project) => isNodeOffline(project.nodeId, onlineNodeIds)).map((project) => project.id)),
    [onlineNodeIds, projects],
  )

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => readCollapsedFolders())
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null)
  // Right-click / long-press coordinates for the project menu. On desktop the
  // 3-dot button is hidden, so the menu is anchored to the cursor via an
  // invisible trigger; on touch it falls back to the row's own button.
  const [projectMenuAnchor, setProjectMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const openMenuMoveTargets = useMemo(
    () => (openMenuProjectId ? getProjectMoveTargets(projects, openMenuProjectId) : []),
    [openMenuProjectId, projects],
  )

  const toggleFolder = useCallback((projectId: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      writeCollapsedFolders(next)
      return next
    })
  }, [])

  /**
   * Depth-first list of rows to render. A search flattens the tree — matches
   * are scattered across folders and hiding them behind collapsed parents
   * would make the search look broken.
   */
  const visibleProjectRows = useMemo(() => {
    if (normalizedSearchQuery) {
      return filteredProjects.map((project) => ({ project, depth: 0, hasChildren: false }))
    }
    const rows = flattenProjectTree(buildProjectTree(filteredProjects))
    const hiddenUnder = new Set<string>()
    const out: Array<{ project: typeof filteredProjects[number]; depth: number; hasChildren: boolean }> = []
    for (const node of rows) {
      const parentId = node.project.parentId
      if (parentId && hiddenUnder.has(parentId)) {
        // Parent is collapsed (or itself hidden) — hide this whole branch.
        hiddenUnder.add(node.project.id)
        continue
      }
      out.push({ project: node.project, depth: node.depth, hasChildren: node.children.length > 0 })
      if (collapsedFolders.has(node.project.id)) hiddenUnder.add(node.project.id)
    }
    return out
  }, [collapsedFolders, filteredProjects, normalizedSearchQuery])

  /** Folders this project may legally be dropped into, per the shared rules. */
  const canDropProjectInto = useCallback((draggedId: string, targetId: string) => {
    if (!onMoveProject || draggedId === targetId) return false
    return validateProjectMove(projects, draggedId, targetId) === null
  }, [onMoveProject, projects])

  const hasSessionContextMenu = Boolean(onArchiveSession || onMoveSession)

  const openSessionContextMenu = (x: number, y: number, sessionId: string, projectId: string | null) => {
    if (!hasSessionContextMenu) return
    const menuHeight = getSessionContextMenuHeight({
      showMoveSection: Boolean(onMoveSession),
      showStreamingNote: streamingSessionIds?.has(sessionId) ?? false,
      showPersonalTarget: projectId !== null,
      showArchive: Boolean(onArchiveSession),
    })
    setSessionContextMenu({
      sessionId,
      projectId,
      ...getSessionContextMenuPosition(x, y, window.innerWidth, window.innerHeight, menuHeight),
    })
  }

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressOriginRef.current = null
  }

  useEffect(() => cancelLongPress, [])

  /**
   * Touch equivalent of the right-click menu. The press must stay roughly in
   * place — a moving finger is a scroll, not a long press.
   */
  const longPressHandlers = (sessionId: string, projectId: string | null) => ({
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType !== 'touch' || !hasSessionContextMenu) return
      const { clientX, clientY } = event
      cancelLongPress()
      longPressFiredRef.current = false
      longPressOriginRef.current = { x: clientX, y: clientY }
      longPressTimerRef.current = window.setTimeout(() => {
        longPressFiredRef.current = true
        openSessionContextMenu(clientX, clientY, sessionId, projectId)
      }, SESSION_LONG_PRESS_MS)
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const origin = longPressOriginRef.current
      if (!origin) return
      if (Math.abs(event.clientX - origin.x) > 10 || Math.abs(event.clientY - origin.y) > 10) cancelLongPress()
    },
    onPointerUp: cancelLongPress,
    onPointerLeave: cancelLongPress,
    onPointerCancel: cancelLongPress,
  })

  /** True when the tap that just ended was consumed by the long-press menu. */
  const consumedByLongPress = () => {
    if (!longPressFiredRef.current) return false
    longPressFiredRef.current = false
    return true
  }

  /**
   * Right-click opens the project's 3-dot menu (the native browser context
   * menu is suppressed). On touch, a long press performs the same role. We
   * mark the open so the click that follows a touch long-press doesn't also
   * select the project.
   */
  const openProjectMenu = (projectId: string, x: number, y: number) => {
    projectMenuJustOpenedRef.current = true
    setProjectMenuAnchor({ x, y })
    setOpenMenuProjectId(projectId)
  }

  const projectRowMenuHandlers = (projectId: string) => ({
    onContextMenu: (event: ReactMouseEvent) => {
      event.preventDefault()
      openProjectMenu(projectId, event.clientX, event.clientY)
    },
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType !== 'touch') return
      cancelLongPress()
      const { clientX, clientY } = event
      longPressOriginRef.current = { x: clientX, y: clientY }
      longPressTimerRef.current = window.setTimeout(() => {
        longPressFiredRef.current = true
        openProjectMenu(projectId, clientX, clientY)
      }, PROJECT_LONG_PRESS_MS)
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const origin = longPressOriginRef.current
      if (!origin) return
      if (Math.abs(event.clientX - origin.x) > 10 || Math.abs(event.clientY - origin.y) > 10) cancelLongPress()
    },
    onPointerUp: cancelLongPress,
    onPointerLeave: cancelLongPress,
    onPointerCancel: cancelLongPress,
  })

  /** Swallows the click that follows a right-click / long-press menu open. */
  const consumedByProjectMenu = () => {
    if (!projectMenuJustOpenedRef.current) return false
    projectMenuJustOpenedRef.current = false
    return true
  }

  const filteredPersonalSessions = useMemo(() => {
    if (!normalizedSearchQuery || onSearch) return displayedPersonalSessions
    return displayedPersonalSessions.filter((session) => (
      [session.name, session.projectPath]
        .some((term) => term?.toLowerCase().includes(normalizedSearchQuery))
    ))
  }, [displayedPersonalSessions, normalizedSearchQuery, onSearch])
  const recentPersonalSessions = normalizedSearchQuery
    ? filteredPersonalSessions
    : filteredPersonalSessions.slice(0, visiblePersonalSessions)
  const hasOlderPersonalSessions = !normalizedSearchQuery
    && filteredPersonalSessions.length > recentPersonalSessions.length

  return (
    <div className="flex flex-col h-full">
      <div className="flex h-[35px] shrink-0 items-center gap-2 px-2.5 border-b">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
          {searchLoading && normalizedSearchQuery
            ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            : <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
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
          {/* Projects and root-level personal chats share one hierarchy. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className={`flex h-8 shrink-0 items-center justify-between px-3 text-left transition-colors hover:bg-muted/30 ${
                dropTargetId === '__root__' ? 'bg-primary/10 ring-2 ring-inset ring-primary' : ''
              }`}
              // Dropping on the section header is the desktop equivalent of
              // "Move to top level".
              onDragOver={(e) => {
                const kind = getSidebarDragKind(e.dataTransfer.types)
                if (kind === 'session') {
                  if (!onMoveSession) return
                  // A chat already in the personal list has nowhere to go at the root.
                  if (dragSessionRef.current?.sourceProjectId === null) return
                } else if (kind === 'project') {
                  if (!onMoveProject) return
                } else {
                  return
                }
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropTargetId('__root__')
              }}
              onDragLeave={() => setDropTargetId((current) => (current === '__root__' ? null : current))}
              onDrop={(e) => {
                setDropTargetId(null)
                const kind = getSidebarDragKind(e.dataTransfer.types)
                if (kind === 'session') {
                  const sessionId = e.dataTransfer.getData(JAIT_SESSION_MOVE_MIME)
                  if (!sessionId || !onMoveSession) return
                  e.preventDefault()
                  onMoveSession(sessionId, null)
                  return
                }
                if (!onMoveProject) return
                const draggedId = e.dataTransfer.getData(JAIT_PROJECT_MOVE_MIME)
                if (!draggedId) return
                e.preventDefault()
                onMoveProject(draggedId, null)
              }}
            >
              <span className="text-2xs font-medium text-muted-foreground">Projects & Chats</span>
              {onNewPersonalSession && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-1 h-6 w-6 rounded-md p-1"
                      onClick={onNewPersonalSession}
                    >
                      <MessageSquare className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">New personal chat</TooltipContent>
                </Tooltip>
              )}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-0.5 px-1.5 pb-1.5">
                {!normalizedSearchQuery && projects.length === 0 && personalSessions.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No projects or chats yet.
                    <br />
                    <button onClick={onCreateProject} className="underline underline-offset-2 hover:text-foreground mt-1 inline-block">
                      Create a project
                    </button>
                    {onNewPersonalSession && (
                      <>
                        {' or '}
                        <button onClick={onNewPersonalSession} className="underline underline-offset-2 hover:text-foreground">
                          start a chat
                        </button>
                      </>
                    )}
                  </p>
                )}
                {normalizedSearchQuery && !searchLoading && filteredProjects.length === 0 && filteredPersonalSessions.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No matching projects or chats.
                  </p>
                )}
                {visibleProjectRows.map(({ project, depth, hasChildren }) => {
                  const isFolder = project.kind === 'folder'
                  // Only the open menu needs targets; validating every row on
                  // every render would be O(projects × folders × projects).
                  const moveTargets = openMenuProjectId === project.id ? openMenuMoveTargets : []
                  const isCollapsed = collapsedFolders.has(project.id)
                  const isDropTarget = dropTargetId === project.id
                  const isActiveProject = project.id === activeProjectId
                  const latestSessionId = getLatestProjectSessionId(project)
                  const isLatestProjectSessionActive = isActiveProject && latestSessionId === activeSessionId
                  const remoteNode = project.nodeId && project.nodeId !== 'gateway'
                    ? nodes.find((n) => n.id === project.nodeId)
                    : null
                  const offline = isNodeOffline(project.nodeId, onlineNodeIds)
                  const pathMissing = project.rootPathStatus === 'missing'
                  const repository = getProjectRepository(project, repositories)
                  const sortedSessions = [...project.sessions]
                    .sort((a, b) => (
                      Date.parse(b.lastActiveAt || b.createdAt) - Date.parse(a.lastActiveAt || a.createdAt)
                    ))
                  const visibleSessionLimit = visibleSessionsByProject[project.id] ?? RECENT_SESSIONS_LIMIT
                  const recentSessions = normalizedSearchQuery
                    ? sortedSessions
                    : sortedSessions.slice(0, visibleSessionLimit)
                  const hasOlderSessions = !normalizedSearchQuery && sortedSessions.length > recentSessions.length
                  return (
                    <div key={project.id} style={{ marginLeft: depth * FOLDER_INDENT_PX }}>
                    <div
                      className={`group grid w-full grid-cols-[auto,minmax(0,1fr),auto] items-start gap-1.5 px-1.5 py-1.5 text-sm transition-colors ${
                        offline || isLatestProjectSessionActive ? 'cursor-default' : 'cursor-pointer'
                      } ${
                        isDropTarget
                          ? 'rounded-md ring-2 ring-primary ring-inset bg-primary/10'
                          : isActiveProject ? 'rounded-md bg-secondary/70' : offline ? 'opacity-50' : 'hover:rounded-md hover:bg-muted/40'
                      }`}
                      // Workspaces stay draggable as a project *reference* (the
                      // existing prompt-attachment gesture). Every row is also
                      // draggable as a move within the sidebar.
                      draggable={Boolean(project.rootPath) || Boolean(onMoveProject)}
                      onDragStart={(e) => {
                        if (!project.rootPath && !onMoveProject) {
                          e.preventDefault()
                          return
                        }
                        e.dataTransfer.effectAllowed = 'copyMove'
                        // Project/folder rows snapshot to nothing during a
                        // native drag, so always supply an explicit ghost.
                        setDragImageChip(
                          e.dataTransfer,
                          isFolder ? 'folder' : 'project',
                          project.title || (isFolder ? 'Untitled folder' : 'Untitled Project'),
                        )
                        if (onMoveProject) {
                          e.dataTransfer.setData(JAIT_PROJECT_MOVE_MIME, project.id)
                        }
                        if (project.rootPath) {
                          e.dataTransfer.setData(
                            JAIT_PROJECT_REF_MIME,
                            JSON.stringify(buildProjectDragPayload(project.rootPath, project.title || undefined)),
                          )
                        }
                      }}
                      onDragOver={(e) => {
                        const kind = getSidebarDragKind(e.dataTransfer.types)
                        if (kind === 'session') {
                          // Any project row (folder or workspace) can receive a chat.
                          if (!onMoveSession) return
                          // Don't highlight the chat's own project.
                          if (dragSessionRef.current?.sourceProjectId === project.id) return
                        } else if (kind === 'project') {
                          if (!isFolder || !onMoveProject) return
                        } else {
                          return
                        }
                        // The id itself is unreadable during dragover, so the
                        // precise legality check happens on drop; here we only
                        // signal that the row can receive something at all.
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setDropTargetId(project.id)
                      }}
                      onDragLeave={() => setDropTargetId((current) => (current === project.id ? null : current))}
                      onDrop={(e) => {
                        setDropTargetId(null)
                        const kind = getSidebarDragKind(e.dataTransfer.types)
                        if (kind === 'session') {
                          if (!onMoveSession) return
                          const sessionId = e.dataTransfer.getData(JAIT_SESSION_MOVE_MIME)
                          if (!sessionId || dragSessionRef.current?.sourceProjectId === project.id) return
                          e.preventDefault()
                          e.stopPropagation()
                          onMoveSession(sessionId, project.id)
                          return
                        }
                        if (!isFolder || !onMoveProject) return
                        const draggedId = e.dataTransfer.getData(JAIT_PROJECT_MOVE_MIME)
                        if (!draggedId || !canDropProjectInto(draggedId, project.id)) return
                        e.preventDefault()
                        e.stopPropagation()
                        onMoveProject(draggedId, project.id)
                      }}
                      onClick={() => {
                        if (consumedByProjectMenu()) return
                        onDismiss?.()
                        if (!offline && !isLatestProjectSessionActive) onSelectProject(project.id)
                      }}
                      {...projectRowMenuHandlers(project.id)}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                          aria-expanded={!isCollapsed}
                          className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); toggleFolder(project.id) }}
                        >
                          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      ) : pathMissing ? (
                        <FolderX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                      ) : isActiveProject ? (
                        <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <Folder className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 overflow-hidden">
                        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                          <ProjectColorDot color={project.color} />
                          <span className="min-w-0 truncate text-xs font-medium">
                            {project.title || (isFolder ? 'Untitled folder' : 'Untitled Project')}
                          </span>
                          {project.instructions?.trim() && (
                            <span
                              className="shrink-0 rounded bg-primary/15 px-1 text-[9px] font-medium text-primary"
                              title="This folder adds context to its chats"
                            >
                              ctx
                            </span>
                          )}
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
                          {/* A folder has no path by design, so showing "No
                              folder linked" there would read as a defect. */}
                          <span className="min-w-0 truncate">
                            {isFolder
                              ? (project.description?.trim() || 'Chat folder')
                              : (project.rootPath || 'No folder linked')}
                          </span>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0">{formatTime(project.lastActiveAt)}</span>
                        </div>
                        {!isFolder && project.description?.trim() && (
                          <div className="min-w-0 truncate text-2xs text-muted-foreground/80">
                            {project.description}
                          </div>
                        )}
                        {offline && (
                          <div className="mt-0.5 flex items-center gap-1 text-2xs text-orange-500">
                            <WifiOff className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">Node offline</span>
                          </div>
                        )}
                        {pathMissing && (
                          <div
                            className="mt-0.5 flex items-center gap-1 text-2xs text-red-500"
                            title={project.rootPath ? `Folder not found: ${project.rootPath}` : undefined}
                          >
                            <FolderX className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">Path not found</span>
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
                      <div className="mt-0.5 flex shrink-0 items-center self-start">
                        {!isFolder && showEditorModeStatus && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                aria-label={`Editor mode ${project.editorModeActive ? 'active' : 'inactive'} for ${project.title || 'project'}`}
                                className={`flex h-6 w-6 shrink-0 items-center justify-center ${
                                  project.editorModeActive ? 'text-blue-500' : 'text-muted-foreground/40'
                                }`}
                              >
                                <Code className="h-3 w-3" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              Editor mode {project.editorModeActive ? 'active' : 'inactive'}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <DropdownMenu
                          open={openMenuProjectId === project.id}
                          onOpenChange={(open) => {
                            setOpenMenuProjectId(open ? project.id : null)
                            if (!open) setProjectMenuAnchor(null)
                          }}
                        >
                          {/* On desktop the menu is reached by right-clicking the
                              row, so the visible 3-dot affordance is hidden. It is
                              kept on touch devices alongside the long-press. The
                              Radix content is portal-rendered and needs a trigger
                              to anchor to; on desktop we supply an invisible span
                              parked at the right-click point so the menu opens at
                              the cursor. */}
                          {isMobile ? (
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Project actions"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                                onContextMenu={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                          ) : (
                            <DropdownMenuTrigger asChild>
                              <span
                                aria-hidden
                                className="pointer-events-none fixed z-0 h-px w-px opacity-0"
                                style={{
                                  left: openMenuProjectId === project.id ? projectMenuAnchor?.x ?? 0 : -9999,
                                  top: openMenuProjectId === project.id ? projectMenuAnchor?.y ?? 0 : -9999,
                                }}
                              />
                            </DropdownMenuTrigger>
                          )}
                          <DropdownMenuContent align="end" side="right" className="min-w-[10rem]">
                            {onEditProject && (
                              <DropdownMenuItem
                                className="gap-2"
                                onSelect={(e) => {
                                  e.preventDefault()
                                  onEditProject(project.id)
                                }}
                              >
                                <Settings2 className="h-3.5 w-3.5" />
                                <span>{isFolder ? 'Folder settings' : 'Project settings'}</span>
                              </DropdownMenuItem>
                            )}
                            {onCreateFolder && isFolder && (
                              <DropdownMenuItem
                                className="gap-2"
                                onSelect={(e) => {
                                  e.preventDefault()
                                  onCreateFolder(project.id)
                                }}
                              >
                                <FolderPlus className="h-3.5 w-3.5" />
                                <span>New subfolder</span>
                              </DropdownMenuItem>
                            )}
                            {/* Touch has no drag-and-drop worth relying on, so
                                every move must exist as a menu action too.
                                Workspaces belong here as much as folders — that
                                is what lets a "Private" folder hold projects. */}
                            {onMoveProject && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="gap-2">
                                  <FolderInput className="h-3.5 w-3.5" />
                                  <span>Move to folder</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                                  <DropdownMenuItem
                                    className="gap-2"
                                    disabled={!project.parentId}
                                    onSelect={(e) => {
                                      e.preventDefault()
                                      onMoveProject(project.id, null)
                                    }}
                                  >
                                    <CornerUpLeft className="h-3.5 w-3.5" />
                                    <span>Top level</span>
                                  </DropdownMenuItem>
                                  {moveTargets.length > 0 && <DropdownMenuSeparator />}
                                  {moveTargets.map((target) => (
                                    <DropdownMenuItem
                                      key={target.project.id}
                                      className="gap-2"
                                      disabled={target.disabled}
                                      title={target.reason ?? undefined}
                                      style={{ paddingLeft: 10 + target.depth * 12 }}
                                      onSelect={(e) => {
                                        e.preventDefault()
                                        onMoveProject(project.id, target.project.id)
                                      }}
                                    >
                                      <ProjectColorDot color={target.project.color} />
                                      <span className="min-w-0 flex-1 truncate">
                                        {target.project.title || 'Untitled folder'}
                                      </span>
                                      {target.isCurrent && (
                                        <span className="shrink-0 text-2xs text-muted-foreground">current</span>
                                      )}
                                    </DropdownMenuItem>
                                  ))}
                                  {moveTargets.length === 0 && (
                                    <p className="px-2 py-2 text-center text-2xs text-muted-foreground">
                                      No folders yet.
                                    </p>
                                  )}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            )}
                            {onAssignRepository && !isFolder && (
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
                            {!isFolder && (
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
                            )}
                            <DropdownMenuItem
                              className="gap-2 text-red-600 focus:bg-red-500/10 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300"
                              onSelect={(e) => {
                                e.preventDefault()
                                onRemoveProject(project.id)
                              }}
                            >
                              <Archive className="h-3.5 w-3.5" />
                              <span>{isFolder ? 'Archive folder' : 'Archive project'}</span>
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
                              draggable={Boolean(onMoveSession) && !isStreaming}
                              onDragStart={(e) => {
                                if (!onMoveSession || isStreaming) {
                                  e.preventDefault()
                                  return
                                }
                                e.dataTransfer.effectAllowed = 'copyMove'
                                e.dataTransfer.setData(JAIT_SESSION_MOVE_MIME, session.id)
                                e.dataTransfer.setData(
                                  JAIT_CHAT_REF_MIME,
                                  JSON.stringify(buildChatDragPayload(session.id, session.name || undefined)),
                                )
                                setDragImageChip(e.dataTransfer, 'chat', session.name || 'Untitled session')
                                dragSessionRef.current = { sessionId: session.id, sourceProjectId: project.id }
                              }}
                              onDragEnd={() => {
                                dragSessionRef.current = null
                              }}
                              onClick={() => {
                                if (consumedByLongPress()) return
                                onDismiss?.()
                                if (!isActiveSession) onSelectProjectSession?.(project.id, session.id)
                              }}
                              onContextMenu={(event) => {
                                if (!hasSessionContextMenu) return
                                event.preventDefault()
                                event.stopPropagation()
                                openSessionContextMenu(event.clientX, event.clientY, session.id, project.id)
                              }}
                              {...longPressHandlers(session.id, project.id)}
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
                              <SessionChatIcon metadata={session.metadata} />
                              {!isActiveSession && isSessionUnread(session) && <UnreadDot />}
                              <span className="shrink-0 text-2xs text-muted-foreground">
                                {formatTime(session.lastActiveAt || session.createdAt)}
                              </span>
                            </div>
                          )
                        })}
                        {hasOlderSessions && (
                          <button
                            type="button"
                            className="w-full rounded-md px-1.5 py-1 text-left text-2xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                            onClick={() => setVisibleSessionsByProject((current) => ({
                              ...current,
                              [project.id]: visibleSessionLimit + RECENT_SESSIONS_LIMIT,
                            }))}
                          >
                            Show older
                          </button>
                        )}
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
              <div className="mx-1.5 my-1 border-t" />
              {/* Dropping a chat here moves it back to the personal chats
                  (top level), mirroring the "Projects & Chats" header. */}
              <div
                className={`flex h-8 shrink-0 items-center justify-between px-3 text-left transition-colors hover:bg-muted/30 ${
                  dropTargetId === '__personal__' ? 'bg-primary/10 ring-2 ring-inset ring-primary' : ''
                }`}
                onDragOver={(e) => {
                  const kind = getSidebarDragKind(e.dataTransfer.types)
                  if (kind !== 'session' || !onMoveSession) return
                  // A chat already in the personal list has nowhere to go here.
                  if (dragSessionRef.current?.sourceProjectId === null) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDropTargetId('__personal__')
                }}
                onDragLeave={() => setDropTargetId((current) => (current === '__personal__' ? null : current))}
                onDrop={(e) => {
                  setDropTargetId(null)
                  const kind = getSidebarDragKind(e.dataTransfer.types)
                  if (kind !== 'session' || !onMoveSession) return
                  const sessionId = e.dataTransfer.getData(JAIT_SESSION_MOVE_MIME)
                  if (!sessionId || dragSessionRef.current?.sourceProjectId === null) return
                  e.preventDefault()
                  onMoveSession(sessionId, null)
                }}
              >
                <span className="text-2xs font-medium text-muted-foreground">Personal chats</span>
              </div>
              <div className="space-y-0.5 px-1.5 pb-1.5">
                {recentPersonalSessions.map((session) => {
                  const isActive = activeProjectId === null && session.id === activeSessionId
                  const isStreaming = streamingSessionIds?.has(session.id) ?? false
                  return (
                    <div
                      key={session.id}
                      className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors text-sm ${
                        isActive ? 'bg-secondary/70 cursor-default' : 'cursor-pointer hover:bg-muted/40'
                      }`}
                      draggable={Boolean(onMoveSession) && !isStreaming}
                      onDragStart={(e) => {
                        if (!onMoveSession || isStreaming) {
                          e.preventDefault()
                          return
                        }
                        e.dataTransfer.effectAllowed = 'copyMove'
                        e.dataTransfer.setData(JAIT_SESSION_MOVE_MIME, session.id)
                        e.dataTransfer.setData(
                          JAIT_CHAT_REF_MIME,
                          JSON.stringify(buildChatDragPayload(session.id, session.name || undefined)),
                        )
                        setDragImageChip(e.dataTransfer, 'chat', session.name || 'Untitled session')
                        dragSessionRef.current = { sessionId: session.id, sourceProjectId: null }
                      }}
                      onDragEnd={() => {
                        dragSessionRef.current = null
                      }}
                      onClick={() => {
                        if (consumedByLongPress()) return
                        onDismiss?.()
                        if (!isActive && onSelectPersonalSession) onSelectPersonalSession(session.id)
                      }}
                      onContextMenu={(event) => {
                        if (!hasSessionContextMenu) return
                        event.preventDefault()
                        event.stopPropagation()
                        openSessionContextMenu(event.clientX, event.clientY, session.id, null)
                      }}
                      {...longPressHandlers(session.id, null)}
                    >
                      {isStreaming ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                      ) : (
                        <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">
                          {session.name || 'Personal chat'}
                        </div>
                      </div>
                      <SessionChatIcon metadata={session.metadata} />
                      {!isActive && isSessionUnread(session) && <UnreadDot />}
                      <span className="shrink-0 text-2xs text-muted-foreground">
                        {formatTime(session.lastActiveAt ?? session.createdAt)}
                      </span>
                    </div>
                  )
                })}
                {hasOlderPersonalSessions && (
                  <button
                    type="button"
                    className="w-full rounded-md px-1.5 py-1 text-left text-2xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    onClick={() => setVisiblePersonalSessions((current) => current + RECENT_SESSIONS_LIMIT)}
                  >
                    Show older
                  </button>
                )}
              </div>
            </ScrollArea>
          </div>

          {sessionContextMenu && (
            <SessionContextMenu
              sessionId={sessionContextMenu.sessionId}
              sessionProjectId={sessionContextMenu.projectId}
              left={sessionContextMenu.left}
              top={sessionContextMenu.top}
              projects={projects}
              offlineProjectIds={offlineProjectIds}
              isStreaming={streamingSessionIds?.has(sessionContextMenu.sessionId) ?? false}
              onMoveSession={onMoveSession}
              onArchiveSession={onArchiveSession}
              onSearchProjects={onSearchProjects}
              onClose={() => setSessionContextMenu(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
