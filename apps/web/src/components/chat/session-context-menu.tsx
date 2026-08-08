import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Folder, Loader2, MessageSquare, Search, WifiOff } from 'lucide-react'
import type { ProjectRecord } from '@/hooks/useProjects'

/** Above this many projects the picker gets its own search field. */
export const SESSION_MOVE_SEARCH_THRESHOLD = 5
/** Rows the picker shows before it starts scrolling. */
export const SESSION_MOVE_VISIBLE_ROWS = 6

/**
 * Rough rendered height of the menu, used to keep it inside the viewport
 * before it has ever been laid out. Only the sections that actually render
 * count — a streaming chat still shows the (disabled) move section.
 */
export function getSessionContextMenuHeight(options: {
  showMoveSection: boolean
  projectCount: number
  showSearch: boolean
  showStreamingNote: boolean
  showPersonalTarget: boolean
  showArchive: boolean
}): number {
  const ROW_HEIGHT = 30
  let height = 8 // menu padding
  if (options.showMoveSection) {
    height += 22 // section label
    if (options.showStreamingNote) height += 18
    if (options.showSearch) height += 34
    height += Math.min(Math.max(options.projectCount, 1), SESSION_MOVE_VISIBLE_ROWS) * ROW_HEIGHT
    if (options.showPersonalTarget) height += ROW_HEIGHT
    if (options.showArchive) height += 9 // divider
  }
  if (options.showArchive) height += ROW_HEIGHT
  return height
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
  const [query, setQuery] = useState('')
  const [remoteResults, setRemoteResults] = useState<ProjectRecord[] | null>(null)
  const [searching, setSearching] = useState(false)
  const searchRequestRef = useRef(0)
  const normalizedQuery = query.trim().toLowerCase()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

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
    if (remoteResults) return remoteResults
    if (!normalizedQuery) return projects
    return projects.filter((project) => (
      [project.title, project.rootPath].some((term) => term?.toLowerCase().includes(normalizedQuery))
    ))
  }, [normalizedQuery, projects, remoteResults])

  const showSearch = Boolean(onSearchProjects) || projects.length > SESSION_MOVE_SEARCH_THRESHOLD
  const canMove = Boolean(onMoveSession) && !isStreaming

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
            <div className="px-2 pb-1 pt-1.5 text-2xs font-medium text-muted-foreground">
              Move to project
            </div>

            {isStreaming && (
              <p className="px-2 pb-1 text-2xs text-muted-foreground">
                Not while this chat is responding.
              </p>
            )}

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
              {candidates.map((project) => {
                const isCurrent = project.id === sessionProjectId
                const offline = offlineProjectIds?.has(project.id) ?? false
                return (
                  <button
                    key={project.id}
                    type="button"
                    role="menuitem"
                    disabled={!canMove || isCurrent}
                    title={isCurrent ? 'Already in this project' : project.rootPath ?? undefined}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => move(project.id)}
                  >
                    <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {project.title || 'Untitled Project'}
                    </span>
                    {isCurrent && <span className="shrink-0 text-2xs text-muted-foreground">current</span>}
                    {offline && !isCurrent && (
                      <WifiOff className="h-3 w-3 shrink-0 text-orange-500" aria-label="Node offline" />
                    )}
                  </button>
                )
              })}
            </div>

            {sessionProjectId !== null && (
              <button
                type="button"
                role="menuitem"
                disabled={!canMove}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={() => move(null)}
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
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive outline-none transition-colors hover:bg-accent focus:bg-accent focus:text-accent-foreground"
            onClick={() => {
              onArchiveSession(sessionId)
              onClose()
            }}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>Archive chat</span>
          </button>
        )}
      </div>
    </div>
  )
}
