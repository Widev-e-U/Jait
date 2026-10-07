import { useEffect, useState } from 'react'
import type { ProviderId } from '@jait/shared'
import { ProviderModelSelector } from '@/components/chat/provider-model-selector'
import { providerIcon } from '@/components/icons/provider-icons'
import type { PersonaAgentDraft } from '@/lib/persona-agents'

export function AgentProviderEditor({ agent, onSave, compact = false }: {
  compact?: boolean
  agent: PersonaAgentDraft
  onSave: (provider: string, model: string | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [provider, setProvider] = useState(agent.providerId)
  const [model, setModel] = useState(agent.model ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setProvider(agent.providerId); setModel(agent.model ?? null) }, [agent.id, agent.providerId, agent.model])
  const Icon = providerIcon(agent.providerId)
  const save = async (nextProvider: string, nextModel: string | null) => {
    setBusy(true); setError('')
    try { await onSave(nextProvider, nextModel); setEditing(false) }
    catch (error) { setProvider(agent.providerId); setModel(agent.model ?? null); setEditing(false); setError(error instanceof Error ? error.message : 'Could not save provider') }
    finally { setBusy(false) }
  }
  return <div className="min-w-0" aria-label={`Provider for ${agent.name}`}>
    {!editing ? <button type="button" className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary" title={`${agent.providerId} · ${agent.model || 'Default model'}`} aria-label={`Change provider and model for ${agent.name}`} onClick={() => { setError(''); setEditing(true) }}>
      <Icon className="h-4 w-4 shrink-0" />{!compact && <span className="max-w-40 truncate">{agent.model || agent.providerId}</span>}
    </button> : <div className="flex flex-wrap items-center gap-1">
      <ProviderModelSelector compact provider={provider as ProviderId} model={model} disabled={busy} onProviderChange={(value) => { setProvider(value); setModel(null); void save(value, null) }} onModelChange={(value) => { setModel(value); void save(provider, value) }} />
      {busy && <span role="status" className="text-xs text-muted-foreground">Saving…</span>}
    </div>}
    {error && <p role="alert" className="mt-1 max-w-64 text-xs text-destructive">{error}</p>}
  </div>
}
