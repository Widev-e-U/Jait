import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { browserCollaborationApi, type BrowserIntervention, type BrowserSession } from '@/lib/browser-collaboration-api'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message) return message
  }
  return 'Failed to refresh browser collaboration state'
}

export function useBrowserCollaboration(token?: string | null, enabled = true) {
  const [sessions, setSessions] = useState<BrowserSession[]>([])
  const [interventions, setInterventions] = useState<BrowserIntervention[]>([])
  const [loading, setLoading] = useState(false)
  const wsConnectedRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!enabled || !token) {
      setSessions([])
      setInterventions([])
      return
    }
    setLoading(true)
    try {
      const [sessionRes, interventionRes] = await Promise.all([
        browserCollaborationApi.listSessions(token),
        browserCollaborationApi.listInterventions(token, 'open'),
      ])
      setSessions(sessionRes.sessions)
      setInterventions(interventionRes.interventions)
    } catch (error) {
      if (wsConnectedRef.current) {
        toast.error(getErrorMessage(error))
      }
    } finally {
      setLoading(false)
    }
  }, [enabled, token])

  useEffect(() => {
    void refresh()
    if (!enabled || !token) return
    // Poll only when WS is not connected; otherwise rely on WS events
    const maybeStartPolling = () => {
      if (wsConnectedRef.current) return null
      return window.setInterval(() => { void refresh() }, 30000)
    }
    let pollHandle: number | null = maybeStartPolling()
    const checkHandle = window.setInterval(() => {
      const shouldPoll = !wsConnectedRef.current
      if (shouldPoll && pollHandle == null) pollHandle = window.setInterval(() => { void refresh() }, 30000)
      if (!shouldPoll && pollHandle != null) { window.clearInterval(pollHandle); pollHandle = null }
    }, 5000)
    return () => { if (pollHandle) window.clearInterval(pollHandle); window.clearInterval(checkHandle) }
  }, [enabled, refresh, token])

  const takeControl = useCallback(async (browserSessionId: string) => {
    if (!token) return
    await browserCollaborationApi.takeControl(browserSessionId, token)
    await refresh()
  }, [refresh, token])

  const returnControl = useCallback(async (browserSessionId: string) => {
    if (!token) return
    await browserCollaborationApi.returnControl(browserSessionId, token)
    await refresh()
  }, [refresh, token])

  const resume = useCallback(async (browserSessionId: string) => {
    if (!token) return
    await browserCollaborationApi.resume(browserSessionId, token)
    await refresh()
  }, [refresh, token])

  const resolveIntervention = useCallback(async (interventionId: string, userNote?: string) => {
    if (!token) return
    await browserCollaborationApi.resolveIntervention(interventionId, token, userNote)
    await refresh()
  }, [refresh, token])

  // WS integration: update state from pushed events
  const handleWsEvent = useCallback((eventType: string, payload: Record<string, unknown>) => {
    if (eventType === 'browser.updated') {
      const nextSessions = Array.isArray((payload as any).sessions) ? (payload as any).sessions as BrowserSession[] : []
      const nextInterventions = Array.isArray((payload as any).interventions) ? (payload as any).interventions as BrowserIntervention[] : []
      setSessions(nextSessions)
      setInterventions(nextInterventions.filter((i) => i.status === 'open'))
      return
    }
    if (eventType.startsWith('browser.session')) {
      const session = (payload as any).session as BrowserSession | undefined
      if (!session) return
      setSessions((prev) => {
        const exists = prev.some((s) => s.id === session.id)
        return exists ? prev.map((s) => s.id === session.id ? session : s) : [session, ...prev]
      })
      return
    }
    if (eventType.startsWith('browser.intervention')) {
      const intervention = (payload as any).intervention as BrowserIntervention | undefined
      if (!intervention) return
      setInterventions((prev) => {
        const isOpen = intervention.status === 'open'
        const without = prev.filter((i) => i.id !== intervention.id)
        return isOpen ? [intervention, ...without] : without
      })
      return
    }
  }, [])

  const setWsConnected = useCallback((connected: boolean) => {
    wsConnectedRef.current = connected
    if (!connected) {
      // opportunistic refresh on disconnect to avoid stale UI
      void refresh()
    }
  }, [refresh])

  return {
    sessions,
    interventions,
    loading,
    refresh,
    takeControl,
    returnControl,
    resume,
    resolveIntervention,
    handleWsEvent,
    setWsConnected,
  }
}
