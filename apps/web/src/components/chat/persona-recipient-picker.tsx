import { useCallback, useEffect, useRef, useState } from 'react'
import { agentsApi } from '@/lib/agents-api'
import type { PersonaAgentDraft } from '@/lib/persona-agents'

export function PersonaRecipientPicker({ value, onChange, authToken }: {
  value: string | undefined
  onChange: (id: string | undefined) => void
  authToken: string | null
}) {
  const [agents, setAgents] = useState<PersonaAgentDraft[]>([])
  const [error, setError] = useState<string | null>(null)
  const loadRevision = useRef(0)
  const load = useCallback(async () => {
    const revision = ++loadRevision.current
    if (!authToken) { setAgents([]); return }
    try {
      const profiles = await agentsApi.listPersonaAgents()
      if (revision !== loadRevision.current) return
      setAgents(profiles)
      setError(null)
    } catch { if (revision === loadRevision.current) setError('Could not load saved agents') }
  }, [authToken])
  useEffect(() => {
    setAgents([])
    setError(null)
    void load()
    return () => { loadRevision.current += 1 }
  }, [load])
  const selected = agents.find((agent) => agent.id === value)
  return <div className="flex min-w-0 items-center gap-1">
    <select aria-label="Chat recipient" value={value ?? ''} onFocus={() => { void load() }}
      onChange={(event) => onChange(event.target.value || undefined)}
      title={selected ? `${selected.name} · ${selected.providerId} · ${selected.model ?? 'Default model'}` : 'Choose who answers in this conversation'}
      className="h-7 max-w-40 rounded-md border border-border bg-background px-1.5 text-xs">
      <option value="">Default assistant</option>
      {value && !selected && <option value={value}>Selected agent unavailable</option>}
      {agents.map((agent) => <option key={agent.id} value={agent.id} disabled={agent.paused}>
        {agent.name}{agent.paused ? ' (paused)' : ''}
      </option>)}
    </select>
    {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
  </div>
}
