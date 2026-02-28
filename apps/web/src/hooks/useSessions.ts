import { useState, useCallback, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

export interface Session {
  id: string
  name: string | null
  workspacePath: string | null
  status: 'active' | 'archived' | 'deleted'
  createdAt: string
  lastActiveAt: string
  metadata: string | null
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const [sessionsRes, lastActiveRes] = await Promise.all([
        fetch(`${API_URL}/api/sessions?status=active`),
        fetch(`${API_URL}/api/sessions/last-active`),
      ])
      if (sessionsRes.ok) {
        const data = (await sessionsRes.json()) as { sessions: Session[] }
        setSessions(data.sessions)
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
  }, [])

  const createSession = useCallback(async (name?: string) => {
    try {
      const res = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || `Session ${new Date().toLocaleString()}` }),
      })
      if (res.ok) {
        const session = (await res.json()) as Session
        setSessions((prev) => [session, ...prev])
        setActiveSessionId(session.id)
        return session
      }
    } catch (err) {
      console.error('Failed to create session:', err)
    }
    return null
  }, [])

  const switchSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
  }, [])

  const archiveSession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`${API_URL}/api/sessions/${sessionId}/archive`, { method: 'POST' })
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
      }
    } catch (err) {
      console.error('Failed to archive session:', err)
    }
  }, [activeSessionId])

  // Load sessions on mount
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  return {
    sessions,
    activeSessionId,
    loading,
    fetchSessions,
    createSession,
    switchSession,
    archiveSession,
  }
}
