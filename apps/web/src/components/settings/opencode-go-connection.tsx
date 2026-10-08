import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { agentsApi } from '@/lib/agents-api'

export function OpenCodeGoConnection({ accountId, onConnected }: {
  accountId: string
  onConnected: () => Promise<void>
}) {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const connect = async () => {
    if (!apiKey.trim() || busy) return
    setBusy(true)
    try {
      await agentsApi.connectOpenCodeGo(accountId, apiKey.trim())
      setApiKey('')
      await onConnected()
      toast.success('OpenCode Go API key saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not connect OpenCode Go')
    } finally { setBusy(false) }
  }
  return <div className="mt-2 space-y-2">
    <p className="text-xs text-muted-foreground">Connect your Go subscription with a key from <a href="https://opencode.ai/zen" target="_blank" rel="noreferrer" className="underline">OpenCode Console</a>.</p>
    <div className="flex gap-2">
      <Input type="password" autoComplete="off" aria-label="OpenCode Go API key" placeholder="OpenCode Go API key" value={apiKey} disabled={busy} onChange={event => setApiKey(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void connect() }} />
      <Button variant="outline" size="sm" disabled={!apiKey.trim() || busy} onClick={() => void connect()}>{busy ? 'Connecting…' : 'Connect Go'}</Button>
    </div>
  </div>
}
