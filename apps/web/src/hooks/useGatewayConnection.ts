import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'

import { getApiUrl, getStoredGatewayUrl, setStoredGatewayUrl, isGatewayConfigured } from '@/lib/gateway-url'

export interface UseGatewayConnectionOptions {
  /** Standalone apps (desktop/Capacitor) start on the URL step until a gateway is configured. */
  isStandaloneApp: boolean
}

/**
 * Owns the gateway-connection step of the auth screen: which step is shown
 * (`url` vs `auth`), the URL input, in-flight/health-check state, and the
 * health-check submit. Extracted from the `App` god component; the gateway
 * URL/auth split is a self-contained concern separate from the login form.
 */
export function useGatewayConnection({ isStandaloneApp }: UseGatewayConnectionOptions) {
  const [gatewayUrlInput, setGatewayUrlInput] = useState(() => getStoredGatewayUrl() ?? '')
  const [gatewayStep, setGatewayStep] = useState<'url' | 'auth'>(() =>
    isStandaloneApp && !isGatewayConfigured() ? 'url' : 'auth'
  )
  const [gatewayChecking, setGatewayChecking] = useState(false)
  const [gatewayError, setGatewayError] = useState<string | null>(null)

  const checkGatewayHealth = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    const url = gatewayUrlInput.trim()
    if (!url) { setGatewayError('Please enter a gateway URL'); return }
    setGatewayChecking(true)
    setGatewayError(null)
    try {
      const clean = url.replace(/\/+$/, '')
      const res = await fetch(`${clean}/health`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const currentUrl = getApiUrl()
      setStoredGatewayUrl(clean)
      if (clean !== currentUrl) {
        // URL changed — reload so all modules pick up the new gateway
        window.location.reload()
        return
      }
      setGatewayStep('auth')
    } catch (err) {
      setGatewayError(
        err instanceof Error
          ? err.name === 'TimeoutError' || err.name === 'AbortError'
            ? 'Connection timed out'
            : err.message
          : 'Failed to connect',
      )
    } finally {
      setGatewayChecking(false)
    }
  }, [gatewayUrlInput])

  return {
    gatewayStep,
    setGatewayStep,
    gatewayUrlInput,
    setGatewayUrlInput,
    gatewayChecking,
    gatewayError,
    setGatewayError,
    checkGatewayHealth,
  }
}
