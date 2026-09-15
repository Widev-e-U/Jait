import { useState } from 'react'
import type { OllamaUsageSetup } from '@jait/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getApiUrl } from '@/lib/gateway-url'
import { getAuthToken } from '@/lib/auth-token'

export function OllamaUsageSetupPanel({ setup, connected, retry, loading }: {
  setup?: OllamaUsageSetup
  connected: boolean
  retry: () => Promise<void>
  loading: boolean
}) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function saveKey() {
    setSaving(true)
    setMessage(null)
    try {
      const token = getAuthToken()
      if (!token) throw new Error('Sign in to Jait again to save your key.')
      const response = await fetch(`${getApiUrl()}/api/provider-usage/ollama/api-key`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'Could not save the key. Please try again.')
      }
      setApiKey('')
      setMessage('Key verified and saved. Refreshing usage…')
      await retry()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the key.')
    } finally {
      setSaving(false)
    }
  }

  async function copyCommand() {
    if (!setup?.permissionCommand) return
    try {
      await navigator.clipboard.writeText(setup.permissionCommand)
      setCopied(true)
    } catch {
      setMessage('Copy failed. Select and copy the command below.')
    }
  }

  return (
    <section aria-label="Ollama usage setup" className="space-y-4 rounded-lg border p-4 text-sm">
      <div className="space-y-1">
        <h4 className="font-medium">Set up cloud usage</h4>
        <p className="text-muted-foreground">
          {connected ? 'Your Ollama account is connected. Usage needs separate access to Ollama Cloud.' : 'Connect an Ollama Cloud account to display subscription limits.'}
          {' '}Local model activity does not count toward these cloud limits.
        </p>
      </div>
      <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void saveKey() }}>
        <label htmlFor="ollama-usage-key" className="font-medium">Use an Ollama Cloud API key</label>
        <p className="text-xs text-muted-foreground">
          <a href="https://ollama.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Create a key in Ollama</a>
          {' '}using the account whose usage you want to see. This key is saved to your Jait settings and used for all your Ollama usage profiles.
        </p>
        <Input id="ollama-usage-key" type="password" autoComplete="off" spellCheck={false}
          placeholder="Ollama Cloud API key" value={apiKey} disabled={saving}
          onChange={(event) => setApiKey(event.target.value)} />
        <Button type="submit" size="sm" disabled={!apiKey.trim() || saving || loading}>
          {saving ? 'Checking key…' : 'Save and test'}
        </Button>
      </form>
      <details className="space-y-2">
        <summary className="cursor-pointer font-medium">Use an existing Ollama login</summary>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Run setup on the machine running the Jait gateway, even when you use Jait from a phone or another computer.</p>
          {setup && <p>Gateway: <strong>{setup.host}</strong> · User: <strong>{setup.gatewayUser}</strong> · {setup.platform}</p>}
          {!setup ? (
            <p>Update the gateway to get detected key paths and permission instructions, or use an API key above.</p>
          ) : !setup.local ? (
            <p>This Ollama backend is remote or hosted in the cloud. The gateway cannot use that machine’s device key. Use a Cloud API key above, or have the server administrator configure usage access.</p>
          ) : (
            <>
              {setup.keyPath && <p className="break-all">Device key: <code>{setup.keyPath}</code></p>}
              {setup.keyStatus === 'missing' && <p>No device key was found. Sign in with <code>ollama signin</code> on the Ollama host. For a custom key location, set <code>JAIT_OLLAMA_DEVICE_KEY_PATH</code> in the gateway’s service environment, grant its user read access, and restart the gateway. In Docker, mount the key into the gateway container at that path.</p>}
              {setup.keyStatus === 'readable' && <p>The device key is readable. Ensure this Ollama installation is signed in to the account shown above, then test again. Check the reported error if usage still fails.</p>}
              {setup.keyStatus === 'unreadable' && <p>Jait cannot read the device key. Grant the gateway user read access to this file and traversal access to its parent directories.</p>}
              {setup.permissionCommand && (
                <>
                  <p>On the gateway host, this command grants only the gateway user read access. It requires administrator authentication. If <code>setfacl</code> is missing, install your Linux distribution’s ACL utilities first.</p>
                  <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-foreground">{setup.permissionCommand}</pre>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyCommand()}>{copied ? 'Copied' : 'Copy command'}</Button>
                  <p>Enter your sudo password only in the terminal. Then test the connection below.</p>
                </>
              )}
              {setup.keyStatus === 'unreadable' && !setup.permissionCommand && <p>Ask the host administrator to grant this user read access using the operating system’s file permissions, or use an API key above.</p>}
            </>
          )}
        </div>
      </details>
      <Button type="button" variant="outline" size="sm" disabled={saving || loading} onClick={() => { setMessage(null); void retry() }}>
        {loading ? 'Testing connection…' : 'Test connection'}
      </Button>
      {message && <p role="status" className="text-xs">{message}</p>}
    </section>
  )
}
