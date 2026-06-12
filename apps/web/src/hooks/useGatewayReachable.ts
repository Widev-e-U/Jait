import { useCallback, useEffect, useRef, useState } from 'react'
import { getApiUrl } from '@/lib/gateway-url'

export interface UseGatewayReachableResult {
  /** `null` until the first probe resolves, then `true`/`false`. */
  gatewayReachable: boolean | null
  /** Reset and re-probe the gateway (used by the "unavailable" retry button). */
  retry: () => void
}

/** Probes the gateway `/health` endpoint once on mount and exposes a manual retry. */
export function useGatewayReachable(): UseGatewayReachableResult {
  const [gatewayReachable, setGatewayReachable] = useState<boolean | null>(null)
  const gatewayCheckRef = useRef(false)

  const checkGatewayReachable = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/health`, { signal: AbortSignal.timeout(5000) })
      setGatewayReachable(res.ok)
    } catch {
      setGatewayReachable(false)
    }
  }, [])

  useEffect(() => {
    if (gatewayCheckRef.current) return
    gatewayCheckRef.current = true
    void checkGatewayReachable()
  }, [checkGatewayReachable])

  const retry = useCallback(() => {
    gatewayCheckRef.current = false
    setGatewayReachable(null)
    void checkGatewayReachable()
  }, [checkGatewayReachable])

  return { gatewayReachable, retry }
}
