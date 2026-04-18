import { useState } from 'react'
import { ServerCrash, RefreshCw } from 'lucide-react'
import { getApiUrl } from '@/lib/gateway-url'

export function GatewayUnavailable({ onRetry }: { onRetry: () => void }) {
  const [retrying, setRetrying] = useState(false)

  const handleRetry = () => {
    setRetrying(true)
    onRetry()
    // Reset spinner after a short delay in case the parent doesn't unmount us
    setTimeout(() => setRetrying(false), 3000)
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
      <div className="flex max-w-md flex-col items-center gap-6 px-6 text-center">
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
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Connecting…' : 'Retry Connection'}
        </button>
      </div>
    </div>
  )
}
