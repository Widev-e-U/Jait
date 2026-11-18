import { useCallback, useEffect, useRef, useState } from 'react'
import { agentsApi } from '@/lib/agents-api'
import { agentControlApi, type AgentControlState, type AgentHaltResult } from '@/lib/agent-control-api'

const RUNNING: AgentControlState = { halted: false, reason: null, haltedAt: null, updatedAt: null }

function normalizeEventPayload(payload: unknown): AgentControlState | null {
  if (!payload || typeof payload !== 'object') return null
  const candidate = payload as Partial<AgentControlState>
  if (typeof candidate.halted !== 'boolean') return null
  return {
    halted: candidate.halted,
    reason: typeof candidate.reason === 'string' ? candidate.reason : null,
    haltedAt: typeof candidate.haltedAt === 'string' ? candidate.haltedAt : null,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
  }
}

export interface UseAgentControlOptions {
  /** Token whose change means a different user (or none); state is re-read. */
  token?: string | null
  /** Whether the client is allowed to call the gateway right now. */
  enabled?: boolean
}

/**
 * Owner-wide autonomous-execution switch, driven by server state.
 *
 * The halt is not an optimistic local flag: the banner appears from the
 * broadcast the gateway sends after the row is written, and a reconnect
 * re-reads the current state. So a second tab, a phone or a fresh load all
 * agree, and a resume performed anywhere clears the banner everywhere.
 */
export function useAgentControl({ token, enabled = true }: UseAgentControlOptions = {}) {
  const [state, setState] = useState<AgentControlState>(RUNNING)
  const [avatars, setAvatars] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let active = true
    setAvatars([])
    if (enabled) void agentsApi.listPersonaAgents().then(agents => {
      if (active) setAvatars(agents.map(agent => agent.avatar))
    }).catch(() => {})
    return () => { active = false }
  }, [token, enabled])

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      const result = await agentControlApi.get()
      if (mountedRef.current) setState(result.state ?? RUNNING)
    } catch {
      // The banner must never be invented from a failed read; a network blip
      // leaves the last known state rather than claiming agents are stopped.
    }
  }, [enabled])

  useEffect(() => {
    setState(RUNNING)
    setPending(false)
    setError(null)
    void refresh()
  }, [token, refresh])

  /** Applies a broadcast `agent.halted` event. Server state, not a local flip. */
  const applyEvent = useCallback((payload: unknown) => {
    const next = normalizeEventPayload(payload)
    if (next) setState(next)
  }, [])

  const stopAll = useCallback(async (reason?: string): Promise<AgentHaltResult | null> => {
    setPending(true)
    setError(null)
    try {
      const result = await agentControlApi.halt(reason)
      if (mountedRef.current) {
        setState(result.state ?? RUNNING)
        setError(result.stopError ? `Some work could not stop: ${result.stopError}` : null)
      }
      return result
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Could not stop agents')
      return null
    } finally {
      if (mountedRef.current) setPending(false)
    }
  }, [])

  const resume = useCallback(async (): Promise<boolean> => {
    setPending(true)
    setError(null)
    try {
      const result = await agentControlApi.resume()
      if (mountedRef.current) setState(result.state ?? RUNNING)
      return true
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Could not resume agents')
      return false
    } finally {
      if (mountedRef.current) setPending(false)
    }
  }, [])

  return { state, avatars, halted: state.halted, pending, error, refresh, applyEvent, stopAll, resume }
}
