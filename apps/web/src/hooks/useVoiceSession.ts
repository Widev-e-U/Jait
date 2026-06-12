import { useCallback, useRef, useState } from 'react'
import { useVoiceAssistant } from '@/hooks/useVoiceAssistant'
import { summarizeForVoice } from '@/lib/voice-levels'
import { agentsApi, type AgentThread } from '@/lib/agents-api'

export interface UseVoiceSessionOptions {
  /** Auth token forwarded to the realtime voice-assistant connection. */
  token: string | null
}

export interface UseVoiceSessionResult {
  voiceOverlayOpen: boolean
  setVoiceOverlayOpen: (open: boolean) => void
  voiceAssistant: ReturnType<typeof useVoiceAssistant>
  startVoiceSession: () => void
  /** Speaks a summary of a finished thread; no-op unless the voice overlay is open. */
  announceThreadResult: (completedThread: AgentThread) => Promise<void>
}

/**
 * Realtime voice-assistant session (OpenAI Realtime via the gateway): owns the
 * overlay open state, the underlying `useVoiceAssistant` connection, and the
 * spoken thread-completion announcements.
 */
export function useVoiceSession({ token }: UseVoiceSessionOptions): UseVoiceSessionResult {
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false)
  const voiceAssistantRef = useRef<ReturnType<typeof useVoiceAssistant> | null>(null)
  const voiceOverlayOpenRef = useRef(false)

  const voiceAssistant = useVoiceAssistant({
    authToken: token,
    onError: (err) => {
      console.warn('[voice] error:', err)
    },
    onDisconnected: () => {
      setVoiceOverlayOpen(false)
    },
  })
  voiceAssistantRef.current = voiceAssistant
  voiceOverlayOpenRef.current = voiceOverlayOpen

  const announceThreadResult = useCallback(async (completedThread: AgentThread) => {
    if (!voiceOverlayOpenRef.current) return
    try {
      const activities = await agentsApi.getActivities(completedThread.id, 40)
      const lastAssistantActivity = [...activities].reverse().find((activity) => {
        if (activity.kind !== 'message') return false
        const payload = (activity.payload ?? {}) as Record<string, unknown>
        return payload.role === 'assistant' && (typeof payload.content === 'string' || typeof activity.summary === 'string')
      })

      const payload = (lastAssistantActivity?.payload ?? {}) as Record<string, unknown>
      const assistantText = typeof payload.content === 'string'
        ? payload.content
        : (lastAssistantActivity?.summary ?? '')
      const summary = summarizeForVoice(assistantText)
      const spokenUpdate = summary
        ? `${completedThread.title} finished. ${summary}`
        : completedThread.status === 'completed'
          ? `${completedThread.title} finished successfully.`
          : `${completedThread.title} finished with status ${completedThread.status}.`
      voiceAssistantRef.current?.announce(spokenUpdate)
    } catch {
      const fallback = completedThread.status === 'completed'
        ? `${completedThread.title} finished successfully.`
        : `${completedThread.title} finished with status ${completedThread.status}.`
      voiceAssistantRef.current?.announce(fallback)
    }
  }, [])

  const startVoiceSession = useCallback(() => {
    setVoiceOverlayOpen(true)
    void voiceAssistant.connect()
  }, [voiceAssistant])

  return {
    voiceOverlayOpen,
    setVoiceOverlayOpen,
    voiceAssistant,
    startVoiceSession,
    announceThreadResult,
  }
}
