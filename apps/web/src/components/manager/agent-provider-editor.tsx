import { useRef, useState } from 'react'
import type { ProviderId } from '@jait/shared'
import { ProviderModelSelector } from '@/components/chat/provider-model-selector'
import type { PersonaAgentDraft } from '@/lib/persona-agents'

export function AgentProviderEditor({ agent, onSave, compact = false }: {
  compact?: boolean
  agent: PersonaAgentDraft
  onSave: (provider: string, model: string | null) => Promise<void>
}) {
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (provider: string, model: string | null) => {
    if (saving.current || (provider === agent.providerId && model === (agent.model ?? null))) return
    saving.current = true
    setBusy(true); setError('')
    try { await onSave(provider, model) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save provider') }
    finally { saving.current = false; setBusy(false) }
  }
  return <div className="min-w-0" aria-label={`Provider for ${agent.name}`}>
    <ProviderModelSelector compact={compact} provider={agent.providerId as ProviderId} model={agent.model ?? null}
      triggerLabel={`Change provider and model for ${agent.name}`} reconcileSelection={false}
      reasoningEffort={null} disabled={busy}
      onProviderChange={(value) => { void save(value, null) }}
      onModelChange={(value) => { void save(agent.providerId, value) }} />
    {busy && <span role="status" className="text-xs text-muted-foreground">Saving…</span>}
    {error && <p role="alert" className="mt-1 max-w-64 text-xs text-destructive">{error}</p>}
  </div>
}
