import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { getApiUrl } from '@/lib/gateway-url'
import type { AutomationRepo } from '@/lib/agents-api'
import { getLatestProjectSessionId } from '@/lib/project-sessions'
import {
  getChatCacheScope,
  readCachedProjectIndex,
  writeCachedProjectIndex,
} from '@/lib/chat-history-cache'

const API_URL = getApiUrl()
const PROJECT_LIST_LIMIT = 10

export interface ProjectSession {
  id: string
  projectId: string | null
  name: string | null
  projectPath: string | null
  status: 'active' | 'archived' | 'deleted'
  createdAt: string
  lastActiveAt: string
  metadata: string | null
}

export interface ProjectRecord {
  id: string
  title: string | null
  rootPath: string | null
  nodeId: string | null
  status: 'active' | 'archived' | 'deleted'
  createdAt: string
  lastActiveAt: string
  metadata: string | null
  sessions: ProjectSession[]
}

export interface CreateProjectOptions {
  title?: string
  rootPath?: string | null
  nodeId?: string | null
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
  const cacheHydratedScopeRef = useRef<string | null>(null)
  const hasCachedProjectIndexRef = useRef(false)
  const cacheWriteReadyScopeRef = useRef<string | null>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  activeProjectIdRef.current = activeProjectId
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
        const currentActiveProjectId = activeProjectIdRef.current
        if (currentActiveProjectId && !nextProjects.some((project) => project.id === currentActiveProjectId)) {
          try {
            const activeProjectRes = await fetch(`${API_URL}/api/projects/${currentActiveProjectId}`, { headers: authHeaders(token) })
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

  const createProject = useCallback(async (options: CreateProjectOptions = {}) => {
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
        }),
      })
      if (res.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (!res.ok) return null
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
            ? { ...project, lastActiveAt: session.lastActiveAt, sessions: [session, ...project.sessions] }
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
    }).catch(() => { /* best-effort */ })
  }, [token])

  const switchProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId)
    setActiveSessionId(() => {
      const project = projects.find((item) => item.id === projectId)
      if (!project) return null
      const sessionId = getLatestProjectSessionId(project)
      persistSelection(projectId, sessionId)
      return sessionId
    })
  }, [persistSelection, projects])

  const switchSession = useCallback((projectId: string | null, sessionId: string) => {
    setActiveProjectId(projectId)
    setActiveSessionId(sessionId)
    persistSelection(projectId, sessionId)
  }, [persistSelection])

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

  const updateProject = useCallback(async (projectId: string, data: { rootPath?: string; nodeId?: string; title?: string }) => {
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
      if (!res.ok) return null
      const project = await res.json() as Omit<ProjectRecord, 'sessions'> & { sessions?: ProjectSession[] }
      const updated: ProjectRecord = { ...project, sessions: project.sessions ?? [] }
      setProjects((prev) => prev.map((w) => w.id === projectId ? { ...w, ...updated } : w))
      return updated
    } catch (err) {
      console.error('Failed to update project:', err)
      return null
    }
  }, [onLoginRequired, token])

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

  const showMoreProjects = useCallback(() => {
    setVisibleLimit((prev) => prev + PROJECT_LIST_LIMIT)
  }, [])

  const showFewerProjects = useCallback(() => {
    setVisibleLimit(PROJECT_LIST_LIMIT)
  }, [])

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
    fetchProjects,
    createProject,
    updateProject,
    assignProjectRepository,
    createSession,
    switchProject,
    switchSession,
    archiveSession,
    fetchArchivedSessions,
    removeProject,
    clearArchivedProjects,
    fetchArchivedProjects,
    restoreProject,
    renameSession,
    showMoreProjects,
    showFewerProjects,
    projectListLimit: PROJECT_LIST_LIMIT,
  }
}
