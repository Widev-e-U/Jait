import { useState, type FormEvent } from 'react'
import { RefreshCw, ServerCrash, Settings2 } from 'lucide-react'
import { getApiUrl, setStoredGatewayUrl } from '@/lib/gateway-url'

interface GatewayUnavailableProps {
  onRetry: () => void
  canSetBackend?: boolean
}

export function normalizeGatewayUrlInput(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Enter a gateway URL.')

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Enter a valid URL, for example http://192.168.1.20:8000.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('The gateway URL must start with http:// or https://.')
  }

  return parsed.toString().replace(/\/$/, '')
}

export function GatewayUnavailable({ onRetry, canSetBackend = false }: GatewayUnavailableProps) {
  const [retrying, setRetrying] = useState(false)
  const [editingBackend, setEditingBackend] = useState(false)
  const [gatewayUrl, setGatewayUrl] = useState(() => getApiUrl())
  const [gatewayError, setGatewayError] = useState<string | null>(null)

  const handleRetry = () => {
    setRetrying(true)
    onRetry()
    // Reset spinner after a short delay in case the parent doesn't unmount us
    setTimeout(() => setRetrying(false), 3000)
  }

  const handleSaveBackend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      const normalizedUrl = normalizeGatewayUrlInput(gatewayUrl)
      setGatewayError(null)
      setStoredGatewayUrl(normalizedUrl)
      window.location.reload()
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Enter a valid gateway URL.')
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-6 px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <ServerCrash className="h-10 w-10 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Backend Unavailable</h1>
          <p className="text-sm text-muted-foreground">
            Unable to connect to the Jait gateway at{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              {getApiUrl()}
            </code>
          </p>
          <p className="text-sm text-muted-foreground">
            Make sure the gateway is running and accessible, then try again.
          </p>
        </div>

        {editingBackend ? (
          <form className="w-full space-y-4 text-left" onSubmit={handleSaveBackend}>
            <div className="space-y-2">
              <label htmlFor="gateway-url" className="text-sm font-medium">
                Gateway URL
              </label>
              <input
                id="gateway-url"
                type="url"
                value={gatewayUrl}
                onChange={(event) => {
                  setGatewayUrl(event.target.value)
                  setGatewayError(null)
                }}
                autoFocus
                spellCheck={false}
                placeholder="http://192.168.1.20:8000"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Nothing is contacted while you edit. Jait reconnects after you save.
              </p>
              {gatewayError && <p className="text-xs text-destructive">{gatewayError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingBackend(false)
                  setGatewayError(null)
                  setGatewayUrl(getApiUrl())
                }}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
              >
                Save and connect
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
              {retrying ? 'Connecting…' : 'Retry Connection'}
            </button>
            {canSetBackend && (
              <button
                type="button"
                onClick={() => setEditingBackend(true)}
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                <Settings2 className="h-4 w-4" />
                Set backend
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
