import { useState, useCallback, useEffect } from 'react'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()
const SESSION_LIST_LIMIT = 10

export interface Session {
  id: string
  name: string | null
  workspacePath: string | null
  status: 'active' | 'archived' | 'deleted'
  createdAt: string
  lastActiveAt: string
  metadata: string | null
}

function authHeaders(token?: string | null): Record<string, string> {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export function useSessions(token?: string | null, onLoginRequired?: () => void) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [visibleLimit, setVisibleLimit] = useState(SESSION_LIST_LIMIT)
  const [hasMoreSessions, setHasMoreSessions] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchSessions = useCallback(async () => {
    if (!token) {
      setSessions(prev => prev.length === 0 ? prev : [])
      setActiveSessionId(null)
      setHasMoreSessions(false)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [sessionsRes, lastActiveRes] = await Promise.all([
        fetch(`${API_URL}/api/sessions?status=active&limit=${visibleLimit}`, { headers: authHeaders(token) }),
        fetch(`${API_URL}/api/sessions/last-active`, { headers: authHeaders(token) }),
      ])
      if (sessionsRes.status === 401 || lastActiveRes.status === 401) {
        onLoginRequired?.()
      }
      if (sessionsRes.ok) {
        const data = (await sessionsRes.json()) as { sessions: Session[]; hasMore?: boolean }
        setSessions(data.sessions)
        setHasMoreSessions(Boolean(data.hasMore))
      }
      if (lastActiveRes.ok) {
        const data = (await lastActiveRes.json()) as { session: Session | null }
        if (data.session) {
          setActiveSessionId((prev) => prev ?? data.session!.id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [onLoginRequired, token, visibleLimit])

  const createSession = useCallback(async (name?: string) => {
    if (!token) {
      onLoginRequired?.()
      return null
    }
    try {
      const res = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || `Session ${new Date().toLocaleString()}` }),
      })
      if (res.status === 401) {
        onLoginRequired?.()
        return null
      }
      if (res.ok) {
        const session = (await res.json()) as Session
        setSessions((prev) => [session, ...prev].slice(0, visibleLimit))
        setActiveSessionId(session.id)
        return session
      }
    } catch (err) {
      console.error('Failed to create session:', err)
    }
    return null
  }, [onLoginRequired, token])

  const switchSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
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
      await fetchSessions()
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
      }
    } catch (err) {
      console.error('Failed to archive session:', err)
    }
  }, [activeSessionId, fetchSessions, onLoginRequired, token])

  const showMoreSessions = useCallback(() => {
    setVisibleLimit((prev) => prev + SESSION_LIST_LIMIT)
  }, [])

  const showFewerSessions = useCallback(() => {
    setVisibleLimit(SESSION_LIST_LIMIT)
  }, [])

  // Load sessions on mount
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  return {
    sessions,
    activeSessionId,
    loading,
    hasMoreSessions,
    fetchSessions,
    createSession,
    switchSession,
    archiveSession,
    showMoreSessions,
    showFewerSessions,
    sessionListLimit: SESSION_LIST_LIMIT,
  }
}
