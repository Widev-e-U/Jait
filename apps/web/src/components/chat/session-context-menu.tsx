import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ChevronRight, Folder, Loader2, MessageSquare, Search, WifiOff } from 'lucide-react'
import { buildProjectTree, flattenProjectTree } from '@jait/shared'
import { ProjectColorDot } from '@/components/project/project-color-picker'
import type { ProjectRecord } from '@/hooks/useProjects'
import { TooltipHint } from '@/components/ui/tooltip'

/** Above this many projects the picker gets its own search field. */
export const SESSION_MOVE_SEARCH_THRESHOLD = 5
/** Rows the picker shows before it starts scrolling. */
export const SESSION_MOVE_VISIBLE_ROWS = 6
export const SESSION_MOVE_SUBMENU_WIDTH = 256
const SUBMENU_MARGIN = 8
/** Grace period for the pointer to travel from the parent row into the submenu. */
const SUBMENU_CLOSE_DELAY_MS = 180

/**
 * Rough rendered height of the menu, used to keep it inside the viewport
 * before it has ever been laid out. The project list lives in a submenu, so
 * only the top-level rows count here.
 */
export function getSessionContextMenuHeight(options: {
  showMoveSection: boolean
  showStreamingNote: boolean
  showPersonalTarget: boolean
  showArchive: boolean
}): number {
  const ROW_HEIGHT = 30
  let height = 8 // menu padding
  if (options.showMoveSection) {
    height += ROW_HEIGHT // "Move to project" parent row
    if (options.showStreamingNote) height += 18
    if (options.showPersonalTarget) height += ROW_HEIGHT
    if (options.showArchive) height += 9 // divider
  }
  if (options.showArchive) height += ROW_HEIGHT
  return height
}

/**
 * Places the project submenu next to its parent row: to the right by default,
 * flipped to the left when the right edge has no room, and lifted so its
 * bottom stays on screen.
 */
export function getSessionMoveSubmenuPosition(
  anchor: { left: number; right: number; top: number },
  viewport: { width: number; height: number },
  submenu: { width: number; height: number },
) {
  const fitsRight = anchor.right + submenu.width + SUBMENU_MARGIN <= viewport.width
  const left = fitsRight
    ? anchor.right
    : Math.max(SUBMENU_MARGIN, anchor.left - submenu.width)
  const top = Math.max(
    SUBMENU_MARGIN,
    Math.min(anchor.top, viewport.height - submenu.height - SUBMENU_MARGIN),
  )
  return { left, top }
}

export interface SessionMoveSubmenuProps {
  left: number
  top: number
  /** Project the chat currently lives in — not a valid target for itself. */
  sessionProjectId: string | null
  projects: ProjectRecord[]
  offlineProjectIds?: Set<string>
  disabled?: boolean
  onSelectProject: (projectId: string) => void
  onSearchProjects?: (query: string) => Promise<ProjectRecord[]>
}

/** The project list that opens next to "Move to project". */
export function SessionMoveSubmenu({
  left,
  top,
  sessionProjectId,
  projects,
  offlineProjectIds,
  disabled = false,
  onSelectProject,
  onSearchProjects,
}: SessionMoveSubmenuProps) {
  const [query, setQuery] = useState('')
  const [remoteResults, setRemoteResults] = useState<ProjectRecord[] | null>(null)
  const [searching, setSearching] = useState(false)
  const searchRequestRef = useRef(0)
  const normalizedQuery = query.trim().toLowerCase()

  useEffect(() => {
    if (!onSearchProjects || !normalizedQuery) {
      setRemoteResults(null)
      setSearching(false)
      return
    }
    const requestId = ++searchRequestRef.current
    setSearching(true)
    const timer = window.setTimeout(() => {
      void onSearchProjects(query.trim())
        .then((results) => {
          if (requestId === searchRequestRef.current) setRemoteResults(results)
        })
        .catch(() => {
          if (requestId === searchRequestRef.current) setRemoteResults([])
        })
        .finally(() => {
          if (requestId === searchRequestRef.current) setSearching(false)
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [normalizedQuery, onSearchProjects, query])

  const candidates = useMemo(() => {
    // A remote lookup already applied the query; a local list still has to.
    if (remoteResults) return remoteResults.map((project) => ({ project, depth: 0 }))
    if (normalizedQuery) {
      return projects
        .filter((project) => (
          [project.title, project.rootPath, project.description]
            .some((term) => term?.toLowerCase().includes(normalizedQuery))
        ))
        .map((project) => ({ project, depth: 0 }))
    }
    // No query: show the real hierarchy so "which folder is this?" is obvious
    // when several folders share a name across different parents.
    return flattenProjectTree(buildProjectTree(projects))
      .map((node) => ({ project: node.project, depth: node.depth }))
  }, [normalizedQuery, projects, remoteResults])

  const showSearch = Boolean(onSearchProjects) || projects.length > SESSION_MOVE_SEARCH_THRESHOLD

  return (
    <div
      role="menu"
      aria-label="Move to project"
      className="fixed flex w-64 flex-col rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      {showSearch && (
        <div className="mx-1 mb-1 flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
          {searching
            ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            : <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <input
            type="search"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}

      <div className="max-h-52 overflow-y-auto">
        {candidates.length === 0 && (
          <p className="px-2 py-2 text-center text-2xs text-muted-foreground">
            {normalizedQuery ? 'No matching projects.' : 'No projects yet.'}
          </p>
        )}
        {candidates.map(({ project, depth }) => {
          const isCurrent = project.id === sessionProjectId
          const offline = offlineProjectIds?.has(project.id) ?? false
          return (
            <TooltipHint key={project.id} content={isCurrent ? 'Already in this project' : project.rootPath ?? project.description ?? undefined}>
            <button
              type="button"
              role="menuitem"
              disabled={disabled || isCurrent}
              style={{ paddingLeft: 8 + depth * 12 }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              onClick={() => onSelectProject(project.id)}
            >
              <ProjectColorDot color={project.color} />
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs">
                {project.title || (project.kind === 'folder' ? 'Untitled folder' : 'Untitled Project')}
              </span>
              {isCurrent && <span className="shrink-0 text-2xs text-muted-foreground">current</span>}
              {offline && !isCurrent && (
                <WifiOff className="h-3 w-3 shrink-0 text-orange-500" aria-label="Node offline" />
              )}
            </button>
            </TooltipHint>
          )
        })}
      </div>
    </div>
  )
}

export interface SessionContextMenuProps {
  sessionId: string
  /** Project the chat currently lives in, or null for a personal chat. */
  sessionProjectId: string | null
  left: number
  top: number
  projects: ProjectRecord[]
  /** Projects whose node is offline — moving there would strand the chat. */
  offlineProjectIds?: Set<string>
  /** Moving mid-response would swap the working directory under a running turn. */
  isStreaming?: boolean
  onMoveSession?: (sessionId: string, projectId: string | null) => void
  onArchiveSession?: (sessionId: string) => void
  /**
   * Looks up projects beyond the ones the sidebar has paged in. Without it the
   * picker can only offer the visible projects.
   */
  onSearchProjects?: (query: string) => Promise<ProjectRecord[]>
  onClose: () => void
}

export function SessionContextMenu({
  sessionId,
  sessionProjectId,
  left,
  top,
  projects,
  offlineProjectIds,
  isStreaming = false,
  onMoveSession,
  onArchiveSession,
  onSearchProjects,
  onClose,
}: SessionContextMenuProps) {
  const [submenu, setSubmenu] = useState<{ left: number; top: number } | null>(null)
  const moveRowRef = useRef<HTMLButtonElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  // Whether the submenu was open when the row was pressed. On touch, tapping
  // fires pointerenter + focus (which open the submenu) before click, so the
  // click must toggle against the state at pointerdown, not the already-opened
  // state, or it would open and immediately close.
  const wasOpenAtPointerDownRef = useRef(false)

  const canMove = Boolean(onMoveSession) && !isStreaming

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape backs out of the project list first, then closes the menu.
      if (submenu) setSubmenu(null)
      else onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, submenu])

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  useEffect(() => clearCloseTimer, [])

  const openSubmenu = () => {
    clearCloseTimer()
    if (!canMove) return
    const anchor = moveRowRef.current?.getBoundingClientRect()
    if (!anchor) return
    setSubmenu(getSessionMoveSubmenuPosition(
      { left: anchor.left, right: anchor.right, top: anchor.top },
      { width: window.innerWidth, height: window.innerHeight },
      // The list scrolls past this, so a fixed estimate is enough to place it.
      { width: SESSION_MOVE_SUBMENU_WIDTH, height: 240 },
    ))
  }

  /** Delayed so the pointer can cross the gap between row and submenu. */
  const scheduleSubmenuClose = () => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => setSubmenu(null), SUBMENU_CLOSE_DELAY_MS)
  }

  const move = (projectId: string | null) => {
    onMoveSession?.(sessionId, projectId)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50"
      onPointerDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        role="menu"
        aria-label="Chat actions"
        className="fixed flex w-64 flex-col rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        style={{ left, top }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        {onMoveSession && (
          <>
            <button
              ref={moveRowRef}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={submenu !== null}
              disabled={!canMove}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-accent"
              onPointerDown={() => {
                wasOpenAtPointerDownRef.current = submenu !== null
              }}
              onClick={() => {
                if (wasOpenAtPointerDownRef.current) setSubmenu(null)
                else openSubmenu()
              }}
              // Hover only opens the submenu for a real mouse. On touch, tapping
              // fires pointerenter + focus (which open the submenu) before click,
              // so the click toggles against the state captured at pointerdown
              // rather than the already-opened state.
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') openSubmenu()
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') scheduleSubmenuClose()
              }}
              onFocus={openSubmenu}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') openSubmenu()
              }}
            >
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs">Move to project</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>

            {isStreaming && (
              <p className="px-2 pb-1 text-2xs text-muted-foreground">
                Not while this chat is responding.
              </p>
            )}

            {sessionProjectId !== null && (
              <button
                type="button"
                role="menuitem"
                disabled={!canMove}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={() => move(null)}
                onPointerEnter={scheduleSubmenuClose}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs">Move to personal chats</span>
              </button>
            )}

            {onArchiveSession && <div className="my-1 h-px bg-border" />}
          </>
        )}

        {onArchiveSession && (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-red-600 outline-none transition-colors hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300"
            onClick={() => {
              onArchiveSession(sessionId)
              onClose()
            }}
            onPointerEnter={scheduleSubmenuClose}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>Archive chat</span>
          </button>
        )}
      </div>

      {submenu && (
        <div onPointerEnter={clearCloseTimer} onPointerLeave={scheduleSubmenuClose}>
          <SessionMoveSubmenu
            left={submenu.left}
            top={submenu.top}
            sessionProjectId={sessionProjectId}
            projects={projects}
            offlineProjectIds={offlineProjectIds}
            onSelectProject={(projectId) => move(projectId)}
            onSearchProjects={onSearchProjects}
          />
        </div>
      )}
    </div>
  )
}
