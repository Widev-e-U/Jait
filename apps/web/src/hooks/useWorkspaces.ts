import { useState, useCallback, useEffect, useMemo } from 'react'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()
const WORKSPACE_LIST_LIMIT = 10

export interface WorkspaceSession {
  id: string
  workspaceId: string | null
  name: string | null
  workspacePath: string | null
  status: 'active' | 'archived' | 'deleted'
  createdAt: string
  lastActiveAt: string
  metadata: string | null
}

export interface WorkspaceRecord {
  id: string
  title: string | null
  rootPath: string | null
  nodeId: string | null
  status: 'active' | 'archived' | 'deleted'
  createdAt: string
  lastActiveAt: string
  metadata: string | null
  sessions: WorkspaceSession[]
}

export interface CreateWorkspaceOptions {
  title?: string
  rootPath?: string | null
  nodeId?: string | null
}

function authHeaders(token?: string | null): Record<string, string> {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export function useWorkspaces(token?: string | null, onLoginRequired?: () => void) {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [personalSessions, setPersonalSessions] = useState<WorkspaceSession[]>([])
  const [archivedSessionsByWorkspace, setArchivedSessionsByWorkspace] = useState<Record<string, WorkspaceSession[]>>({})
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [visibleLimit, setVisibleLimit] = useState(WORKSPACE_LIST_LIMIT)
  const [hasMoreWorkspaces, setHasMoreWorkspaces] = useState(false)
  const [loading, setLoading] = useState(true)

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  )

  const fetchWorkspaces = useCallback(async () => {
    if (!token) {
      setWorkspaces([])
      setPersonalSessions([])
      setArchivedSessionsByWorkspace({})
      setActiveWorkspaceId(null)
      setActiveSessionId(null)
      setHasMoreWorkspaces(false)
      // Keep loading=true until we get a real token and can actually fetch.
      // Setting false here caused a flash of "Add Workspace" empty state.
      return
    }

    setLoading(true)
    try {
      const [workspacesRes, sessionsRes, lastActiveRes] = await Promise.all([
        fetch(`${API_URL}/api/workspaces?status=active&limit=${visibleLimit}`, { headers: authHeaders(token) }),
        fetch(`${API_URL}/api/sessions?status=active&limit=100`, { headers: authHeaders(token) }),
        fetch(`${API_URL}/api/workspaces/last-active`, { headers: authHeaders(token) }),
      ])
      if (workspacesRes.status === 401 || sessionsRes.status === 401 || lastActiveRes.status === 401) {
        onLoginRequired?.()
      }

      let nextWorkspaces: WorkspaceRecord[] = []
      let nextPersonalSessions: WorkspaceSession[] = []
      if (workspacesRes.ok) {
        const data = await workspacesRes.json() as { workspaces: WorkspaceRecord[]; hasMore?: boolean }
        nextWorkspaces = data.workspaces
        setWorkspaces(nextWorkspaces)
        setArchivedSessionsByWorkspace((prev) => Object.fromEntries(
          Object.entries(prev).filter(([workspaceId]) => nextWorkspaces.some((workspace) => workspace.id === workspaceId)),
        ))
        setHasMoreWorkspaces(Boolean(data.hasMore))
      }
      if (sessionsRes.ok) {
        const data = await sessionsRes.json() as { sessions: WorkspaceSession[] }
        nextPersonalSessions = data.sessions.filter((session) => !session.workspaceId)
        setPersonalSessions(nextPersonalSessions)
      }

      if (lastActiveRes.ok) {
        const data = await lastActiveRes.json() as { workspace: WorkspaceRecord | null; session: WorkspaceSession | null }
        setActiveWorkspaceId((prevWorkspaceId) => {
          if (prevWorkspaceId && nextWorkspaces.some((workspace) => workspace.id === prevWorkspaceId)) return prevWorkspaceId
          if (data.session && !data.session.workspaceId) return null
          return data.workspace?.id ?? nextWorkspaces[0]?.id ?? null
        })
        setActiveSessionId((prevSessionId) => {
          if (prevSessionId && nextWorkspaces.some((workspace) => workspace.sessions.some((session) => session.id === prevSessionId))) {
            return prevSessionId
          }
          if (prevSessionId && nextPersonalSessions.some((session) => session.id === prevSessionId)) return prevSessionId
          return data.session?.id ?? nextPersonalSessions[0]?.id ?? nextWorkspaces[0]?.sessions[0]?.id ?? null
        })
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err)
    } finally {
      setLoading(false)
    }
  }, [onLoginRequired, token, visibleLimit])

  const createWorkspace = useCallback(async (options: CreateWorkspaceOptions = {}) => {
    if (!token) {
      onLoginRequired?.()
      return null
    }
    try {
      const res = await fetch(`${API_URL}/api/workspaces`, {
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
      const workspace = await res.json() as Omit<WorkspaceRecord, 'sessions'> & { sessions?: WorkspaceSession[] }
      let nextWorkspace!: WorkspaceRecord
      setWorkspaces((prev) => {
        const existing = prev.find((entry) => entry.id === workspace.id)
        nextWorkspace = { ...workspace, sessions: workspace.sessions ?? existing?.sessions ?? [] }
        const withoutExisting = prev.filter((entry) => entry.id !== nextWorkspace.id)
        return [nextWorkspace, ...withoutExisting].slice(0, visibleLimit)
      })
      setActiveWorkspaceId(nextWorkspace.id)
      setActiveSessionId(null)
      return nextWorkspace
    } catch (err) {
      console.error('Failed to create workspace:', err)
      return null
    }
  }, [onLoginRequired, token, visibleLimit])

  const createSession = useCallback(async (workspaceIdOverride?: string | null, name?: string) => {
    if (!token) {
      onLoginRequired?.()
      return null
    }

    const targetWorkspaceId = workspaceIdOverride === undefined ? activeWorkspaceId : workspaceIdOverride

    try {
      const url = targetWorkspaceId
        ? `${API_URL}/api/workspaces/${targetWorkspaceId}/sessions`
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
      const session = await res.json() as WorkspaceSession
      if (targetWorkspaceId) {
        setWorkspaces((prev) => prev.map((workspace) => (
          workspace.id === targetWorkspaceId
            ? { ...workspace, lastActiveAt: session.lastActiveAt, sessions: [session, ...workspace.sessions] }
            : workspace
        )))
      } else {
        setPersonalSessions((prev) => [session, ...prev.filter((entry) => entry.id !== session.id)])
      }
      setActiveWorkspaceId(targetWorkspaceId ?? null)
      setActiveSessionId(session.id)
      return session
    } catch (err) {
      console.error('Failed to create session:', err)
      return null
    }
  }, [activeWorkspaceId, onLoginRequired, token])

  const persistSelection = useCallback((workspaceId: string, sessionId?: string | null) => {
    if (!token) return
    fetch(`${API_URL}/api/workspaces/select`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, sessionId }),
    }).catch(() => { /* best-effort */ })
  }, [token])

  const switchWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId)
    setActiveSessionId((prev) => {
      const workspace = workspaces.find((item) => item.id === workspaceId)
      if (!workspace) return null
      if (prev && workspace.sessions.some((session) => session.id === prev)) return prev
      const sessionId = workspace.sessions[0]?.id ?? null
      persistSelection(workspaceId, sessionId ?? prev)
      return sessionId
    })
  }, [persistSelection, workspaces])

  const switchSession = useCallback((workspaceId: string | null, sessionId: string) => {
    setActiveWorkspaceId(workspaceId)
    setActiveSessionId(sessionId)
    if (workspaceId) persistSelection(workspaceId, sessionId)
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
      await fetchWorkspaces()
    } catch (err) {
      console.error('Failed to archive session:', err)
    }
  }, [fetchWorkspaces, onLoginRequired, token])

  const fetchArchivedSessions = useCallback(async (workspaceId: string) => {
    if (!token) {
      onLoginRequired?.()
      return []
    }
    try {
      const response = await fetch(`${API_URL}/api/workspaces/${workspaceId}/sessions?status=archived`, {
        headers: authHeaders(token),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return []
      }
      if (!response.ok) return []
      const data = await response.json() as { sessions: WorkspaceSession[] }
      setArchivedSessionsByWorkspace((prev) => ({ ...prev, [workspaceId]: data.sessions }))
      return data.sessions
    } catch (err) {
      console.error('Failed to fetch archived sessions:', err)
      return []
    }
  }, [onLoginRequired, token])

  const updateWorkspace = useCallback(async (workspaceId: string, data: { rootPath?: string; nodeId?: string; title?: string }) => {
    if (!token) {
      onLoginRequired?.()
      return null
    }
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (!res.ok) return null
      const workspace = await res.json() as Omit<WorkspaceRecord, 'sessions'> & { sessions?: WorkspaceSession[] }
      const updated: WorkspaceRecord = { ...workspace, sessions: workspace.sessions ?? [] }
      setWorkspaces((prev) => prev.map((w) => w.id === workspaceId ? { ...w, ...updated } : w))
      return updated
    } catch (err) {
      console.error('Failed to update workspace:', err)
      return null
    }
  }, [onLoginRequired, token])

  const removeWorkspace = useCallback(async (workspaceId: string) => {
    if (!token) {
      onLoginRequired?.()
      return false
    }
    try {
      const response = await fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return false
      }
      if (!response.ok) return false

      const nextWorkspaces = workspaces.filter((workspace) => workspace.id !== workspaceId)
      setWorkspaces(nextWorkspaces)
      if (activeWorkspaceId === workspaceId) {
        setActiveWorkspaceId(nextWorkspaces[0]?.id ?? null)
        setActiveSessionId(nextWorkspaces[0]?.sessions[0]?.id ?? null)
      }
      setArchivedSessionsByWorkspace((prev) => {
        const next = { ...prev }
        delete next[workspaceId]
        return next
      })
      return true
    } catch (err) {
      console.error('Failed to archive workspace:', err)
      return false
    }
  }, [activeWorkspaceId, onLoginRequired, token, workspaces])

  const clearArchivedWorkspaces = useCallback(async (): Promise<number> => {
    if (!token) {
      onLoginRequired?.()
      return 0
    }
    try {
      const response = await fetch(`${API_URL}/api/workspaces/archived`, {
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
      console.error('Failed to clear archived workspaces:', err)
      return 0
    }
  }, [onLoginRequired, token])

  const fetchArchivedWorkspaces = useCallback(async (): Promise<WorkspaceRecord[]> => {
    if (!token) return []
    try {
      const response = await fetch(`${API_URL}/api/workspaces/archived`, {
        headers: authHeaders(token),
      })
      if (!response.ok) return []
      const data = await response.json() as { workspaces: WorkspaceRecord[] }
      return data.workspaces
    } catch {
      return []
    }
  }, [token])

  const restoreWorkspace = useCallback(async (workspaceId: string): Promise<boolean> => {
    if (!token) {
      onLoginRequired?.()
      return false
    }
    try {
      const response = await fetch(`${API_URL}/api/workspaces/${workspaceId}/restore`, {
        method: 'POST',
        headers: authHeaders(token),
      })
      if (response.status === 401) {
        onLoginRequired?.()
        return false
      }
      if (!response.ok) return false
      const restored = await response.json() as WorkspaceRecord
      setWorkspaces((prev) => {
        if (prev.some((w) => w.id === restored.id)) return prev
        return [{ ...restored, sessions: restored.sessions ?? [] }, ...prev]
      })
      return true
    } catch (err) {
      console.error('Failed to restore workspace:', err)
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
      const session = await response.json() as WorkspaceSession
      setWorkspaces((prev) => prev.map((workspace) => ({
        ...workspace,
        sessions: workspace.sessions.map((entry) => entry.id === sessionId ? { ...entry, name: session.name } : entry),
      })))
      setPersonalSessions((prev) => prev.map((entry) => entry.id === sessionId ? { ...entry, name: session.name } : entry))
      setArchivedSessionsByWorkspace((prev) => Object.fromEntries(
        Object.entries(prev).map(([workspaceId, sessions]) => [
          workspaceId,
          sessions.map((entry) => entry.id === sessionId ? { ...entry, name: session.name } : entry),
        ]),
      ))
      return session
    } catch (err) {
      console.error('Failed to rename session:', err)
      return null
    }
  }, [onLoginRequired, token])

  const showMoreWorkspaces = useCallback(() => {
    setVisibleLimit((prev) => prev + WORKSPACE_LIST_LIMIT)
  }, [])

  const showFewerWorkspaces = useCallback(() => {
    setVisibleLimit(WORKSPACE_LIST_LIMIT)
  }, [])

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  return {
    workspaces,
    personalSessions,
    archivedSessionsByWorkspace,
    activeWorkspace,
    activeWorkspaceId,
    activeSessionId,
    loading,
    hasMoreWorkspaces,
    fetchWorkspaces,
    createWorkspace,
    updateWorkspace,
    createSession,
    switchWorkspace,
    switchSession,
    archiveSession,
    fetchArchivedSessions,
    removeWorkspace,
    clearArchivedWorkspaces,
    fetchArchivedWorkspaces,
    restoreWorkspace,
    renameSession,
    showMoreWorkspaces,
    showFewerWorkspaces,
    workspaceListLimit: WORKSPACE_LIST_LIMIT,
  }
}
