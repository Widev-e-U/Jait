import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { getApiUrl } from '@/lib/gateway-url'

/** Iframe/WebSocket links carry a narrow preview grant, never an account token. */
export function usePreviewAccess(source: string | null): string | null {
  const [resolved, setResolved] = useState<{ source: string; url: string } | null>(null)
  let managed = false
  if (source) {
    try {
      const gateway = new URL(getApiUrl() || window.location.origin, window.location.href)
      const target = new URL(source, gateway)
      const livePath = target.searchParams.get('path') ?? new URLSearchParams(target.hash.slice(1)).get('path') ?? ''
      managed = target.origin === gateway.origin && (/^\/api\/dev-(file|proxy)\//.test(target.pathname)
        || (target.pathname.startsWith('/noVNC/') && /^\/?api\/live-view\//.test(livePath)))
    } catch { /* external/unmanaged source */ }
  }
  useEffect(() => {
    if (!source || !managed) return
    let cancelled = false
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await apiFetch(`${getApiUrl()}/api/preview/access`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source }), signal: controller.signal,
        })
        if (!response.ok) return
        const data = await response.json() as { url: string }
        if (!cancelled) setResolved({ source, url: data.url })
      } catch { /* unmounted or preview no longer available */ }
    }
    void load()
    return () => { cancelled = true; controller.abort() }
  }, [source, managed])
  return managed ? (resolved?.source === source ? resolved.url : null) : source
}
