import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ProjectKind } from '@jait/shared'
import { getApiUrl } from '@/lib/gateway-url'
import type { AutomationRepo } from '@/lib/agents-api'
import { getLatestProjectSessionId } from '@/lib/project-sessions'
import {
  getChatCacheScope,
  readCachedProjectIndex,
  writeCachedProjectIndex,
} from '@/lib/chat-history-cache'

const API_URL = getApiUrl()
const PROJECT_LIST_LIMIT = 3

export interface ProjectSession {
  id: string
  projectId: string | null
  name: string | null
  projectPath: string | null
  status: 'active' | 'archived' | 'deleted'
  createdAt: string
  lastActiveAt: string
  viewedAt: string | null
  metadata: string | null
}

export interface ProjectRecord {
  id: string
  title: string | null
  rootPath: string | null
  nodeId: string | null
  /** Parent folder id, or null at the root of the tree. */
  parentId: string | null
  /** 'workspace' = folder on disk; 'folder' = pure chat category. */
  kind: ProjectKind
  /** Extra system-prompt context inherited by every chat below this node. */
  instructions: string | null
  description: string | null
  /** Palette token or `#rrggbb`. */
  color: string | null
  status: 'active' | 'archived' | 'deleted'
  createdAt: string
  lastActiveAt: string
  metadata: string | null
  /** Persisted project editor-panel activation state. */
  editorModeActive?: boolean
  /** Current reachability of the saved project directory on its assigned node. */
  rootPathStatus?: 'available' | 'missing' | 'unreachable' | null
  sessions: ProjectSession[]
}

export interface ProjectSearchResults {
  projects: ProjectRecord[]
  personalSessions: ProjectSession[]
}

export function prependProjectSession(
  sessions: ProjectSession[],
  session: ProjectSession,
): ProjectSession[] {
  return sessions.some((entry) => entry.id === session.id)
    ? sessions
    : [session, ...sessions]
}

/**
 * Re-file a chat inside the project buckets: drop it from wherever it was and
 * insert it into `targetProjectId` (a `null` target means it left projects
 * entirely). Idempotent, so applying it twice — once optimistically, once from
 * the client's own `chat.moved` broadcast — is harmless.
 */
export function applyProjectSessionMove(
  projects: ProjectRecord[],
  session: ProjectSession,
  targetProjectId: string | null,
): ProjectRecord[] {
  return projects.map((project) => {
    const without = project.sessions.filter((entry) => entry.id !== session.id)
    if (project.id === targetProjectId) {
      return { ...project, sessions: [session, ...without] }
    }
    if (without.length === project.sessions.length) return project
    return { ...project, sessions: without }
  })
}

/** Counterpart of `applyProjectSessionMove` for the personal-chats bucket. */
export function applyPersonalSessionMove(
  personalSessions: ProjectSession[],
  session: ProjectSession,
  targetProjectId: string | null,
): ProjectSession[] {
  const without = personalSessions.filter((entry) => entry.id !== session.id)
  if (targetProjectId) {
    return without.length === personalSessions.length ? personalSessions : without
  }
  return [session, ...without]
}

/**
 * Reads the gateway's `{ error, details }` body so a refusal can be shown
 * verbatim ("\"Jait\" already uses that folder.") instead of a generic failure.
 */
async function readRequestError(res: Response): Promise<string | null> {
  try {
    const body = await res.json() as { details?: unknown; error?: unknown }
    if (typeof body.details === 'string' && body.details.trim()) return body.details
    if (typeof body.error === 'string' && body.error.trim()) return body.error
  } catch {
    // Non-JSON body — the caller falls back to its own generic message.
  }
  return null
}

export interface CreateProjectOptions {
  title?: string
  rootPath?: string | null
  nodeId?: string | null
  /** 'folder' creates a chat category with no directory on disk. */
  kind?: ProjectKind
  parentId?: string | null
  description?: string | null
  color?: string | null
  instructions?: string | null
  /**
   * Refuse instead of adopting when another project already uses this
   * directory. Set by the create dialog; the editor's open-folder flow leaves
   * it off because reusing what you already have is the point there.
   */
  exclusiveRoot?: boolean
}

export interface ProjectRepositoryAssignmentResponse {
  project: ProjectRecord
  repo: AutomationRepo
  assigned: boolean
  skipped: boolean
  created: boolean
}

function authHeaders(token?: string | null): Record<string, string> {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export function getMissingSelectedProjectId(
  projects: ProjectRecord[],
  routedProjectId: string | null,
  activeProjectId: string | null,
  cachedActiveProjectId: string | null,
): string | null {
  if (routedProjectId) {
    return projects.some((project) => project.id === routedProjectId) ? null : routedProjectId
  }
  const currentActiveProjectId = activeProjectId ?? cachedActiveProjectId
  return currentActiveProjectId && !projects.some((project) => project.id === currentActiveProjectId)
    ? currentActiveProjectId
    : null
}

export function useProjects(token?: string | null, onLoginRequired?: () => void) {
  const cacheScope = getChatCacheScope(token, API_URL)
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [personalSessions, setPersonalSessions] = useState<ProjectSession[]>([])
  const [archivedSessionsByProject, setArchivedSessionsByProject] = useState<Record<string, ProjectSession[]>>({})
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [visibleLimit, setVisibleLimit] = useState(PROJECT_LIST_LIMIT)
  const [hasMoreProjects, setHasMoreProjects] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchResults, setSearchResults] = useState<ProjectSearchResults | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchRequestRef = useRef(0)
  const cacheHydratedScopeRef = useRef<string | null>(null)
  const hasCachedProjectIndexRef = useRef(false)
  const cacheWriteReadyScopeRef = useRef<string | null>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  activeProjectIdRef.current = activeProjectId
  const activeSessionIdRef = useRef<string | null>(null)
  activeSessionIdRef.current = activeSessionId
  const initialRouteSelectionRef = useRef<{ projectId: string | null; sessionId: string | null } | null>(null)
  if (initialRouteSelectionRef.current === null && typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('sessionId')
    if (sessionId) {
      const projectId = params.get('projectId')
      initialRouteSelectionRef.current = { projectId: projectId || null, sessionId }
    }
  }

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  )

  const hydrateCachedProjectIndex = useCallback(() => {
    if (!cacheScope) {
      cacheHydratedScopeRef.current = null
      hasCachedProjectIndexRef.current = false
      cacheWriteReadyScopeRef.current = null
      return false
    }
    if (cacheHydratedScopeRef.current === cacheScope) return hasCachedProjectIndexRef.current

    cacheHydratedScopeRef.current = cacheScope
    const cached = readCachedProjectIndex<ProjectRecord, ProjectSession>(cacheScope)
    hasCachedProjectIndexRef.current = Boolean(cached)
    cacheWriteReadyScopeRef.current = cacheScope

    if (!cached) {
      setProjects([])
      setPersonalSessions([])
      setActiveProjectId(null)
      setActiveSessionId(null)
      return false
    }

    const routeSelection = initialRouteSelectionRef.current
    const routedPersonalSession = routeSelection?.projectId == null
      ? cached.personalSessions.find((session) => session.id === routeSelection?.sessionId)
      : null
    const routedProject = routeSelection?.projectId
      ? cached.projects.find((project) => project.id === routeSelection.projectId)
      : cached.projects.find((project) => project.sessions.some((session) => session.id === routeSelection?.sessionId))
    const routedProjectSession = routedProject?.sessions.find((session) => session.id === routeSelection?.sessionId) ?? null

    setProjects(cached.projects)
    setPersonalSessions(cached.personalSessions)
    setActiveProjectId(
      routedPersonalSession
        ? null
        : routedProjectSession
          ? routedProject?.id ?? null
          : cached.activeProjectId,
    )
    setActiveSessionId(
      routedPersonalSession?.id
        ?? routedProjectSession?.id
        ?? cached.activeSessionId,
    )
    setHasMoreProjects(cached.hasMoreProjects)
    setLoading(false)
    return true
  }, [cacheScope])

  const fetchProjects = useCallback(async () => {
    if (!token) {
      setProjects([])
      setPersonalSessions([])
      setArchivedSessionsByProject({})
      setActiveProjectId(null)
      setActiveSessionId(null)
      setHasMoreProjects(false)
      cacheHydratedScopeRef.current = null
      hasCachedProjectIndexRef.current = false
      cacheWriteReadyScopeRef.current = null
      // Keep loading=true until we get a real token and can actually fetch.
      // Setting false here caused a flash of "Add Project" empty state.
      return
    }

    const hasCachedProjectIndex = hydrateCachedProjectIndex()
    if (!hasCachedProjectIndex) setLoading(true)
    try {
      const [projectsRes, sessionsRes, lastActiveRes] = await Promise.all([
        fetch(`${API_URL}/api/projects?status=active&limit=${visibleLimit}`, { headers: authHeaders(token) }),
        fetch(`${API_URL}/api/sessions?status=active&limit=100`, { headers: authHeaders(token) }),
        fetch(`${API_URL}/api/projects/last-active`, { headers: authHeaders(token) }),
      ])
      if (projectsRes.status === 401 || sessionsRes.status === 401 || lastActiveRes.status === 401) {
        onLoginRequired?.()
      }

      let nextProjects: ProjectRecord[] = []
      let nextPersonalSessions: ProjectSession[] = []
      if (projectsRes.ok) {
        const data = await projectsRes.json() as { projects: ProjectRecord[]; hasMore?: boolean }
        nextProjects = data.projects

        // The list above is capped to `visibleLimit` and ordered by each
        // project's own activity — unrelated activity on other (e.g. remote
        // node) projects can push the currently active project off this
        // page. Without this, that active project would look "gone" below
        // and we'd silently fall back to whatever the server considers last
        // active, flipping the user onto a different project on reload.
        // An explicit project from a routed chat must win over shared cache
        // state; a newly opened tab/window can otherwise inherit the project
        // that the original window restored after launching it. Without a
        // routed selection, recover committed state or the freshly hydrated
        // cache, whose React state update may not have flushed yet.
        const routeSelection = initialRouteSelectionRef.current
        const missingSelectedProjectId = getMissingSelectedProjectId(
          nextProjects,
          routeSelection?.projectId ?? null,
          activeProjectIdRef.current,
          cacheScope ? readCachedProjectIndex<ProjectRecord, ProjectSession>(cacheScope)?.activeProjectId ?? null : null,
        )
        if (missingSelectedProjectId) {
          try {
            const activeProjectRes = await fetch(`${API_URL}/api/projects/${missingSelectedProjectId}`, { headers: authHeaders(token) })
            if (activeProjectRes.ok) {
              const activeProject = await activeProjectRes.json() as ProjectRecord
              nextProjects = [activeProject, ...nextProjects]
            }
          } catch {
            // Best-effort recovery; fall through with whatever the page returned.
          }
        }

        setProjects(nextProjects)
        setArchivedSessionsByProject((prev) => Object.fromEntries(
          Object.entries(prev).filter(([projectId]) => nextProjects.some((project) => project.id === projectId)),
        ))
        setHasMoreProjects(Boolean(data.hasMore))
      }
      if (sessionsRes.ok) {
        const data = await sessionsRes.json() as { sessions: ProjectSession[] }
        nextPersonalSessions = data.sessions.filter((session) => !session.projectId)
        setPersonalSessions(nextPersonalSessions)
      }

      if (lastActiveRes.ok) {
        const data = await lastActiveRes.json() as { project: ProjectRecord | null; session: ProjectSession | null }
        const routeSelection = initialRouteSelectionRef.current
        const routedPersonalSession = routeSelection?.projectId == null
          ? nextPersonalSessions.find((session) => session.id === routeSelection?.sessionId)
          : null
        const routedProject = routeSelection?.projectId
          ? nextProjects.find((project) => project.id === routeSelection.projectId)
          : nextProjects.find((project) => project.sessions.some((session) => session.id === routeSelection?.sessionId))
        const routedProjectSession = routedProject?.sessions.find((session) => session.id === routeSelection?.sessionId) ?? null

        setActiveProjectId((prevProjectId) => {
          if (routedPersonalSession) return null
          if (routedProjectSession) return routedProject?.id ?? null
          if (prevProjectId && nextProjects.some((project) => project.id === prevProjectId)) return prevProjectId
          if (data.session && !data.session.projectId) return null
          return data.project?.id ?? nextProjects[0]?.id ?? null
        })
        setActiveSessionId((prevSessionId) => {
          if (routedPersonalSession) return routedPersonalSession.id
          if (routedProjectSession) return routedProjectSession.id
          if (prevSessionId && nextProjects.some((project) => project.sessions.some((session) => session.id === prevSessionId))) {
            return prevSessionId
          }
          if (prevSessionId && nextPersonalSessions.some((session) => session.id === prevSessionId)) return prevSessionId
          return data.session?.id ?? nextPersonalSessions[0]?.id ?? getLatestProjectSessionId(nextProjects[0])
        })
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    } finally {
      setLoading(false)
    }
  }, [hydrateCachedProjectIndex, onLoginRequired, token, visibleLimit])

  const loadProject = useCallback(async (projectId: string) => {
    if (!token) {
      onLoginRequired?.()
      return null
    }
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, { headers: authHeaders(token) })
      if (response.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (!response.ok) return null
      const project = await response.json() as ProjectRecord
      const loaded = { ...project, sessions: project.sessions ?? [] }
      setProjects((prev) => [loaded, ...prev.filter((entry) => entry.id !== loaded.id)])
      return loaded
    } catch (err) {
      console.error('Failed to load project:', err)
      return null
    }
  }, [onLoginRequired, token])

  const loadSession = useCallback(async (sessionId: string) => {
    if (!token) {
      onLoginRequired?.()
      return null
    }
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, { headers: authHeaders(token) })
      if (response.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (!response.ok) return null
      const session = await response.json() as ProjectSession
      if (session.projectId) {
        setProjects((prev) => prev.map((project) => (
          project.id === session.projectId && !project.sessions.some((entry) => entry.id === session.id)
            ? { ...project, sessions: [session, ...project.sessions] }
            : project
        )))
      } else {
        setPersonalSessions((prev) => [session, ...prev.filter((entry) => entry.id !== session.id)])
      }
      return session
    } catch (err) {
      console.error('Failed to load session:', err)
      return null
    }
  }, [onLoginRequired, token])

  const searchChats = useCallback(async (query: string) => {
    const normalized = query.trim()
    const requestId = ++searchRequestRef.current
    if (!normalized || !token) {
      setSearchResults(null)
      setSearchLoading(false)
      return
    }

    setSearchResults(null)
    setSearchLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/projects/search?q=${encodeURIComponent(normalized)}`, {
        headers: authHeaders(token),
      })
      if (requestId !== searchRequestRef.current) return
      if (response.status === 401) {
        onLoginRequired?.()
        return
      }
      if (!response.ok) {
        setSearchResults({ projects: [], personalSessions: [] })
        return
      }
      setSearchResults(await response.json() as ProjectSearchResults)
    } catch (err) {
      if (requestId === searchRequestRef.current) {
        console.error('Failed to search chats:', err)
        setSearchResults({ projects: [], personalSessions: [] })
      }
    } finally {
      if (requestId === searchRequestRef.current) setSearchLoading(false)
    }
  }, [onLoginRequired, token])

  /**
   * One-off project lookup that does not touch the sidebar's own search state.
   * Used by the move-chat menu, whose targets may be projects the sidebar has
   * not paged in yet.
   */
  const searchProjects = useCallback(async (query: string): Promise<ProjectRecord[]> => {
    const normalized = query.trim()
    if (!normalized || !token) return []
    try {
      const response = await fetch(`${API_URL}/api/projects/search?q=${encodeURIComponent(normalized)}`, {
        headers: authHeaders(token),
      })
      if (!response.ok) return []
      const data = await response.json() as ProjectSearchResults
      return data.projects ?? []
    } catch (err) {
      console.error('Failed to search projects:', err)
      return []
    }
  }, [token])

  const createProject = useCallback(async (
    options: CreateProjectOptions = {},
    handlers: { onError?: (message: string) => void } = {},
  ) => {
    if (!token) {
      onLoginRequired?.()
      return null
    }
    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: options.title,
          rootPath: options.rootPath,
          nodeId: options.nodeId,
          kind: options.kind,
          parentId: options.parentId,
          description: options.description,
          color: options.color,
          instructions: options.instructions,
          exclusiveRoot: options.exclusiveRoot,
        }),
      })
      if (res.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (!res.ok) {
        const message = await readRequestError(res)
        if (message) handlers.onError?.(message)
        return null
      }
      const project = await res.json() as Omit<ProjectRecord, 'sessions'> & { sessions?: ProjectSession[] }
      let nextProject!: ProjectRecord
      setProjects((prev) => {
        const existing = prev.find((entry) => entry.id === project.id)
        nextProject = { ...project, sessions: project.sessions ?? existing?.sessions ?? [] }
        const withoutExisting = prev.filter((entry) => entry.id !== nextProject.id)
        return [nextProject, ...withoutExisting].slice(0, visibleLimit)
      })
      setActiveProjectId(nextProject.id)
      setActiveSessionId(null)
      return nextProject
    } catch (err) {
      console.error('Failed to create project:', err)
      return null
    }
  }, [onLoginRequired, token, visibleLimit])

  const createSession = useCallback(async (projectIdOverride?: string | null, name?: string) => {
    if (!token) {
      onLoginRequired?.()
      return null
    }

    const targetProjectId = projectIdOverride === undefined ? activeProjectId : projectIdOverride

    try {
      const url = targetProjectId
        ? `${API_URL}/api/projects/${targetProjectId}/sessions`
        : `${API_URL}/api/sessions`
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (!res.ok) return null
      const session = await res.json() as ProjectSession
      if (targetProjectId) {
        setProjects((prev) => prev.map((project) => (
          project.id === targetProjectId
            ? {
                ...project,
                lastActiveAt: session.lastActiveAt,
                sessions: prependProjectSession(project.sessions, session),
              }
            : project
        )))
      } else {
        setPersonalSessions((prev) => [session, ...prev.filter((entry) => entry.id !== session.id)])
      }
      setActiveProjectId(targetProjectId ?? null)
      setActiveSessionId(session.id)
      return session
    } catch (err) {
      console.error('Failed to create session:', err)
      return null
    }
  }, [activeProjectId, onLoginRequired, token])

  const persistSelection = useCallback((projectId: string | null, sessionId?: string | null) => {
    if (!token) return
    fetch(`${API_URL}/api/projects/select`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId }),
      // Mobile reloads/navigations can tear down the document mid-request;
      // keepalive lets the browser finish sending this best-effort write.
      keepalive: true,
    }).catch(() => { /* best-effort */ })
  }, [token])

  // Writes the new selection to localStorage synchronously, instead of
  // relying on the debounced effect below, so a reload that happens right
  // after switching projects/sessions can't race the write and restore the
  // previous selection instead.
  const persistActiveSelectionToCache = useCallback((projectId: string | null, sessionId: string | null) => {
    if (!cacheScope || cacheWriteReadyScopeRef.current !== cacheScope) return
    writeCachedProjectIndex(cacheScope, {
      projects,
      personalSessions,
      activeProjectId: projectId,
      activeSessionId: sessionId,
      hasMoreProjects,
    })
  }, [cacheScope, hasMoreProjects, personalSessions, projects])

  const switchProject = useCallback((projectId: string) => {
    const project = projects.find((item) => item.id === projectId)
    const sessionId = project ? getLatestProjectSessionId(project) : null
    setActiveProjectId(projectId)
    setActiveSessionId(sessionId)
    persistSelection(projectId, sessionId)
    persistActiveSelectionToCache(projectId, sessionId)
  }, [persistActiveSelectionToCache, persistSelection, projects])

  /**
   * Mark a session as read on the gateway (clears its unread dot) and reflect
   * the new viewedAt locally so the indicator disappears without a refetch.
   */
  const markSessionViewed = useCallback(async (sessionId: string) => {
    if (!token) return
    const now = new Date().toISOString()
    // Optimistically clear the dot immediately.
    setPersonalSessions((prev) => prev.map((s) =>
      s.id === sessionId ? { ...s, viewedAt: now } : s,
    ))
    setProjects((prev) => prev.map((p) => ({
      ...p,
      sessions: p.sessions.map((s) => s.id === sessionId ? { ...s, viewedAt: now } : s),
    })))
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/viewed`, {
        method: 'POST',
        headers: authHeaders(token),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return
      }
    } catch (err) {
      console.error('Failed to mark session viewed:', err)
    }
  }, [onLoginRequired, token])

  const switchSession = useCallback((projectId: string | null, sessionId: string) => {
    setActiveProjectId(projectId)
    setActiveSessionId(sessionId)
    persistSelection(projectId, sessionId)
    persistActiveSelectionToCache(projectId, sessionId)
    // Opening a session counts as viewing it — clear its unread indicator.
    void markSessionViewed(sessionId)
  }, [persistActiveSelectionToCache, persistSelection, markSessionViewed])

  const setProjectEditorModeActive = useCallback((projectId: string, editorModeActive: boolean) => {
    setProjects((prev) => prev.map((project) => (
      project.id === projectId && project.editorModeActive !== editorModeActive
        ? { ...project, editorModeActive }
        : project
    )))
    setSearchResults((prev) => prev ? {
      ...prev,
      projects: prev.projects.map((project) => (
        project.id === projectId && project.editorModeActive !== editorModeActive
          ? { ...project, editorModeActive }
          : project
      )),
    } : prev)
  }, [])

  const archiveSession = useCallback(async (sessionId: string) => {
    if (!token) {
      onLoginRequired?.()
      return
    }
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/archive`, {
        method: 'POST',
        headers: authHeaders(token),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return
      }
      await fetchProjects()
    } catch (err) {
      console.error('Failed to archive session:', err)
    }
  }, [fetchProjects, onLoginRequired, token])

  /**
   * Move a chat into another project, or back to the personal chats when
   * `targetProjectId` is null. Applied optimistically so the sidebar reacts
   * immediately, and rolled back if the gateway rejects the move.
   */
  const moveSession = useCallback(async (sessionId: string, targetProjectId: string | null) => {
    if (!token) {
      onLoginRequired?.()
      return false
    }

    const sourceProject = projects.find((project) => project.sessions.some((entry) => entry.id === sessionId)) ?? null
    const session = sourceProject?.sessions.find((entry) => entry.id === sessionId)
      ?? personalSessions.find((entry) => entry.id === sessionId)
      ?? null
    if (!session) return false

    const sourceProjectId = sourceProject?.id ?? null
    if (sourceProjectId === targetProjectId) return true

    const targetProject = targetProjectId
      ? projects.find((project) => project.id === targetProjectId) ?? null
      : null
    // Tool execution resolves the working directory from the project root, so
    // mirror that here instead of keeping the old path around.
    const optimistic: ProjectSession = {
      ...session,
      projectId: targetProjectId,
      projectPath: targetProject?.rootPath ?? null,
    }
    const wasActive = activeSessionIdRef.current === sessionId

    setProjects((prev) => applyProjectSessionMove(prev, optimistic, targetProjectId))
    setPersonalSessions((prev) => applyPersonalSessionMove(prev, optimistic, targetProjectId))
    if (wasActive) {
      setActiveProjectId(targetProjectId)
      persistSelection(targetProjectId, sessionId)
      persistActiveSelectionToCache(targetProjectId, sessionId)
    }

    const rollback = () => {
      setProjects((prev) => applyProjectSessionMove(prev, session, sourceProjectId))
      setPersonalSessions((prev) => applyPersonalSessionMove(prev, session, sourceProjectId))
      if (wasActive) {
        setActiveProjectId(sourceProjectId)
        persistSelection(sourceProjectId, sessionId)
        persistActiveSelectionToCache(sourceProjectId, sessionId)
      }
    }

    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/move`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: targetProjectId }),
      })
      if (response.status === 401) {
        rollback()
        onLoginRequired?.()
        return false
      }
      if (!response.ok) {
        rollback()
        return false
      }
      const data = await response.json() as { session: ProjectSession }
      // Re-apply with the gateway's record so projectPath matches the server.
      setProjects((prev) => applyProjectSessionMove(prev, data.session, targetProjectId))
      setPersonalSessions((prev) => applyPersonalSessionMove(prev, data.session, targetProjectId))
      // The target can be a project the sidebar has not paged in yet (picked
      // through the menu's search) — pull it in so the chat stays visible.
      if (targetProjectId && !targetProject) void loadProject(targetProjectId)
      return true
    } catch (err) {
      console.error('Failed to move session:', err)
      rollback()
      return false
    }
  }, [loadProject, onLoginRequired, personalSessions, persistActiveSelectionToCache, persistSelection, projects, token])

  const fetchArchivedSessions = useCallback(async (projectId: string) => {
    if (!token) {
      onLoginRequired?.()
      return []
    }
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/sessions?status=archived`, {
        headers: authHeaders(token),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return []
      }
      if (!response.ok) return []
      const data = await response.json() as { sessions: ProjectSession[] }
      setArchivedSessionsByProject((prev) => ({ ...prev, [projectId]: data.sessions }))
      return data.sessions
    } catch (err) {
      console.error('Failed to fetch archived sessions:', err)
      return []
    }
  }, [onLoginRequired, token])

  const updateProject = useCallback(async (projectId: string, data: {
    /** Null clears the directory and turns the row back into a grouping folder. */
    rootPath?: string | null
    nodeId?: string | null
    title?: string
    description?: string | null
    color?: string | null
    instructions?: string | null
  }, handlers: { onError?: (message: string) => void } = {}) => {
    if (!token) {
      onLoginRequired?.()
      return null
    }
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (!res.ok) {
        const message = await readRequestError(res)
        if (message) handlers.onError?.(message)
        return null
      }
      const project = await res.json() as Omit<ProjectRecord, 'sessions'> & { sessions?: ProjectSession[] }
      // The PATCH response does not include sessions, so keep whatever the
      // client already had rather than clobbering it with an empty list —
      // otherwise the chat list would appear empty until the next reload.
      let updated!: ProjectRecord
      setProjects((prev) => prev.map((w) => w.id === projectId ? (updated = { ...w, ...project, sessions: project.sessions ?? w.sessions }) : w))
      return updated
    } catch (err) {
      console.error('Failed to update project:', err)
      return null
    }
  }, [onLoginRequired, token])

  /**
   * Re-parent a folder/project. The server re-validates the move, so a stale
   * client tree can never push through a cycle; a rejection returns the reason
   * code for the caller to surface.
   */
  const moveProject = useCallback(async (
    projectId: string,
    parentId: string | null,
  ): Promise<{ ok: true; project: ProjectRecord } | { ok: false; error: string }> => {
    if (!token) {
      onLoginRequired?.()
      return { ok: false, error: 'UNAUTHORIZED' }
    }
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/move`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId }),
      })
      if (res.status === 401) {
        onLoginRequired?.()
        return { ok: false, error: 'UNAUTHORIZED' }
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        return { ok: false, error: body?.error ?? 'MOVE_FAILED' }
      }
      const project = await res.json() as Omit<ProjectRecord, 'sessions'> & { sessions?: ProjectSession[] }
      let next!: ProjectRecord
      setProjects((prev) => prev.map((entry) => {
        if (entry.id !== projectId) return entry
        next = { ...entry, ...project, sessions: project.sessions ?? entry.sessions }
        return next
      }))
      return { ok: true, project: next }
    } catch (err) {
      console.error('Failed to move project:', err)
      return { ok: false, error: 'MOVE_FAILED' }
    }
  }, [onLoginRequired, token])

  /** Chat/folder counts an archive would sweep up, for the confirmation prompt. */
  const fetchProjectSubtree = useCallback(async (projectId: string) => {
    if (!token) return null
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/subtree`, { headers: authHeaders(token) })
      if (!res.ok) return null
      return await res.json() as { descendantCount: number; sessionCount: number }
    } catch {
      return null
    }
  }, [token])

  const assignProjectRepository = useCallback(async (projectId: string, repoId?: string | null): Promise<ProjectRepositoryAssignmentResponse | null> => {
    if (!token) {
      onLoginRequired?.()
      return null
    }
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/repository`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(repoId ? { repoId } : {}),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (!response.ok) return null
      const data = await response.json() as Omit<ProjectRepositoryAssignmentResponse, 'project'> & {
        project: Omit<ProjectRecord, 'sessions'> & { sessions?: ProjectSession[] }
      }
      let nextProject!: ProjectRecord
      setProjects((prev) => prev.map((project) => {
        if (project.id !== data.project.id) return project
        nextProject = { ...data.project, sessions: data.project.sessions ?? project.sessions }
        return nextProject
      }))
      return {
        ...data,
        project: nextProject ?? { ...data.project, sessions: data.project.sessions ?? [] },
      }
    } catch (err) {
      console.error('Failed to assign project repository:', err)
      return null
    }
  }, [onLoginRequired, token])

  const removeProject = useCallback(async (projectId: string) => {
    if (!token) {
      onLoginRequired?.()
      return false
    }
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return false
      }
      if (!response.ok) return false

      const nextProjects = projects.filter((project) => project.id !== projectId)
      setProjects(nextProjects)
      if (activeProjectId === projectId) {
        setActiveProjectId(nextProjects[0]?.id ?? null)
        setActiveSessionId(getLatestProjectSessionId(nextProjects[0]))
      }
      setArchivedSessionsByProject((prev) => {
        const next = { ...prev }
        delete next[projectId]
        return next
      })
      return true
    } catch (err) {
      console.error('Failed to archive project:', err)
      return false
    }
  }, [activeProjectId, onLoginRequired, token, projects])

  const clearArchivedProjects = useCallback(async (): Promise<number> => {
    if (!token) {
      onLoginRequired?.()
      return 0
    }
    try {
      const response = await fetch(`${API_URL}/api/projects/archived`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return 0
      }
      if (!response.ok) return 0
      const data = await response.json() as { ok: boolean; removed: number }
      return data.removed
    } catch (err) {
      console.error('Failed to clear archived projects:', err)
      return 0
    }
  }, [onLoginRequired, token])

  const fetchArchivedProjects = useCallback(async (): Promise<ProjectRecord[]> => {
    if (!token) return []
    try {
      const response = await fetch(`${API_URL}/api/projects/archived`, {
        headers: authHeaders(token),
      })
      if (!response.ok) return []
      const data = await response.json() as { projects: ProjectRecord[] }
      return data.projects
    } catch {
      return []
    }
  }, [token])

  const restoreProject = useCallback(async (projectId: string): Promise<boolean> => {
    if (!token) {
      onLoginRequired?.()
      return false
    }
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/restore`, {
        method: 'POST',
        headers: authHeaders(token),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return false
      }
      if (!response.ok) return false
      const restored = await response.json() as ProjectRecord
      setProjects((prev) => {
        if (prev.some((w) => w.id === restored.id)) return prev
        return [{ ...restored, sessions: restored.sessions ?? [] }, ...prev]
      })
      return true
    } catch (err) {
      console.error('Failed to restore project:', err)
      return false
    }
  }, [onLoginRequired, token])

  const renameSession = useCallback(async (sessionId: string, name: string) => {
    if (!token) {
      onLoginRequired?.()
      return null
    }
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (!response.ok) return null
      const session = await response.json() as ProjectSession
      setProjects((prev) => prev.map((project) => ({
        ...project,
        sessions: project.sessions.map((entry) => entry.id === sessionId ? { ...entry, name: session.name } : entry),
      })))
      setPersonalSessions((prev) => prev.map((entry) => entry.id === sessionId ? { ...entry, name: session.name } : entry))
      setArchivedSessionsByProject((prev) => Object.fromEntries(
        Object.entries(prev).map(([projectId, sessions]) => [
          projectId,
          sessions.map((entry) => entry.id === sessionId ? { ...entry, name: session.name } : entry),
        ]),
      ))
      return session
    } catch (err) {
      console.error('Failed to rename session:', err)
      return null
    }
  }, [onLoginRequired, token])

  /**
   * Record which provider/model/reasoning-effort a chat was last used with.
   * Pass `undefined` to leave a field untouched, or `null` to clear it.
   */
  const updateSessionChatSelection = useCallback(async (
    sessionId: string,
    selection: { provider?: string | null; model?: string | null; reasoningEffort?: string | null },
  ) => {
    if (!token) return null
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(selection),
      })
      if (!response.ok) return null
      const session = await response.json() as ProjectSession
      setProjects((prev) => prev.map((project) => ({
        ...project,
        sessions: project.sessions.map((entry) => entry.id === sessionId ? { ...entry, metadata: session.metadata } : entry),
      })))
      setPersonalSessions((prev) => prev.map((entry) => entry.id === sessionId ? { ...entry, metadata: session.metadata } : entry))
      return session
    } catch (err) {
      console.error('Failed to update session chat selection:', err)
      return null
    }
  }, [token])

  const generateSessionTitle = useCallback(async (sessionId: string, prompt: string, model?: string) => {
    if (!token || !prompt.trim()) return null
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/generate-title`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (!response.ok) return null
      const data = await response.json() as { session: ProjectSession }
      const session = data.session
      setProjects((prev) => prev.map((project) => ({
        ...project,
        sessions: project.sessions.map((entry) => entry.id === sessionId ? { ...entry, name: session.name } : entry),
      })))
      setPersonalSessions((prev) => prev.map((entry) => entry.id === sessionId ? { ...entry, name: session.name } : entry))
      return session
    } catch (err) {
      console.error('Failed to generate session title:', err)
      return null
    }
  }, [onLoginRequired, token])

  const showMoreProjects = useCallback(() => {
    setVisibleLimit((prev) => prev + PROJECT_LIST_LIMIT)
  }, [])

  const showFewerProjects = useCallback(() => {
    setVisibleLimit(PROJECT_LIST_LIMIT)
  }, [])

  // Applies project/chat mutations broadcast over WS by other clients (or
  // this client's other tabs) so the sidebar stays live without a refetch.
  // Every branch dedupes against the initiating client's own REST-driven
  // update, since broadcasts are delivered back to the sender too.
  const handleProjectEvent = useCallback((type: string, payload: Record<string, unknown>) => {
    switch (type) {
      case 'project.created': {
        const project = payload.project as ProjectRecord | undefined
        if (!project) break
        setProjects((prev) => {
          if (prev.some((p) => p.id === project.id)) return prev
          return [{ ...project, sessions: project.sessions ?? [] }, ...prev].slice(0, visibleLimit)
        })
        break
      }
      case 'project.updated': {
        const project = payload.project as ProjectRecord | undefined
        if (!project) break
        setProjects((prev) => prev.map((p) => (
          p.id === project.id ? { ...project, sessions: project.sessions ?? p.sessions } : p
        )))
        break
      }
      case 'project.restored': {
        const project = payload.project as ProjectRecord | undefined
        if (!project) break
        setProjects((prev) => {
          if (prev.some((p) => p.id === project.id)) return prev
          return [{ ...project, sessions: project.sessions ?? [] }, ...prev]
        })
        break
      }
      case 'project.deleted': {
        const projectId = payload.projectId as string | undefined
        if (!projectId) break
        const nextProjects = projects.filter((p) => p.id !== projectId)
        setProjects(nextProjects)
        if (activeProjectIdRef.current === projectId) {
          setActiveProjectId(nextProjects[0]?.id ?? null)
          setActiveSessionId(getLatestProjectSessionId(nextProjects[0]))
        }
        setArchivedSessionsByProject((prev) => {
          if (!(projectId in prev)) return prev
          const next = { ...prev }
          delete next[projectId]
          return next
        })
        break
      }
      case 'chat.created': {
        const projectId = (payload.projectId as string | null | undefined) ?? null
        const session = payload.session as ProjectSession | undefined
        if (!session) break
        if (projectId) {
          setProjects((prev) => prev.map((project) => {
            if (project.id !== projectId) return project
            const sessions = prependProjectSession(project.sessions, session)
            if (sessions === project.sessions) return project
            return { ...project, lastActiveAt: session.lastActiveAt, sessions }
          }))
        } else {
          setPersonalSessions((prev) => (
            prev.some((s) => s.id === session.id) ? prev : [session, ...prev]
          ))
        }
        break
      }
      case 'chat.updated': {
        const session = payload.session as ProjectSession | undefined
        if (!session) break
        setProjects((prev) => prev.map((project) => ({
          ...project,
          sessions: project.sessions.map((entry) => (entry.id === session.id ? { ...entry, ...session } : entry)),
        })))
        setPersonalSessions((prev) => prev.map((entry) => (entry.id === session.id ? { ...entry, ...session } : entry)))
        setArchivedSessionsByProject((prev) => Object.fromEntries(
          Object.entries(prev).map(([pid, sessions]) => [
            pid,
            sessions.map((entry) => (entry.id === session.id ? { ...entry, ...session } : entry)),
          ]),
        ))
        break
      }
      case 'chat.moved': {
        const session = payload.session as ProjectSession | undefined
        if (!session) break
        const toProjectId = (payload.toProjectId as string | null | undefined) ?? null
        setProjects((prev) => applyProjectSessionMove(prev, session, toProjectId))
        setPersonalSessions((prev) => applyPersonalSessionMove(prev, session, toProjectId))
        // Keep the sidebar selection on the chat the user is looking at, even
        // when another tab is what moved it.
        if (activeSessionIdRef.current === session.id) setActiveProjectId(toProjectId)
        break
      }
      case 'chat.archived':
      case 'chat.deleted': {
        const sessionId = payload.sessionId as string | undefined
        if (!sessionId) break
        setProjects((prev) => prev.map((project) => (
          project.sessions.some((s) => s.id === sessionId)
            ? { ...project, sessions: project.sessions.filter((s) => s.id !== sessionId) }
            : project
        )))
        setPersonalSessions((prev) => prev.filter((s) => s.id !== sessionId))
        break
      }
      default:
        break
    }
  }, [projects, visibleLimit])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useLayoutEffect(() => {
    hydrateCachedProjectIndex()
  }, [hydrateCachedProjectIndex])

  useEffect(() => {
    if (!cacheScope || cacheWriteReadyScopeRef.current !== cacheScope) return
    const timer = window.setTimeout(() => {
      writeCachedProjectIndex(cacheScope, {
        projects,
        personalSessions,
        activeProjectId,
        activeSessionId,
        hasMoreProjects,
      })
    }, 100)
    return () => window.clearTimeout(timer)
  }, [activeProjectId, activeSessionId, cacheScope, hasMoreProjects, personalSessions, projects])

  return {
    projects,
    personalSessions,
    archivedSessionsByProject,
    activeProject,
    activeProjectId,
    activeSessionId,
    loading,
    hasMoreProjects,
    searchResults,
    searchLoading,
    fetchProjects,
    loadProject,
    loadSession,
    searchChats,
    searchProjects,
    createProject,
    updateProject,
    moveProject,
    fetchProjectSubtree,
    assignProjectRepository,
    createSession,
    switchProject,
    switchSession,
    setProjectEditorModeActive,
    archiveSession,
    moveSession,
    fetchArchivedSessions,
    removeProject,
    clearArchivedProjects,
    fetchArchivedProjects,
    restoreProject,
    renameSession,
    updateSessionChatSelection,
    generateSessionTitle,
    showMoreProjects,
    showFewerProjects,
    projectListLimit: PROJECT_LIST_LIMIT,
    handleProjectEvent,
  }
}
