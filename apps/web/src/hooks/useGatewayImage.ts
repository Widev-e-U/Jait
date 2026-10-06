import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { getApiUrl } from '@/lib/gateway-url'

/** Fetch protected screenshots with the same credentials as other API calls.
 * External images stay direct URLs so gateway credentials never reach them.
 */
export function useGatewayImage(source: string | null) {
  let protectedImage = false
  if (source) {
    try {
      const gateway = new URL(getApiUrl(), window.location.href)
      const url = new URL(source, window.location.href)
      protectedImage = url.origin === gateway.origin && url.pathname === '/api/browser/screenshot'
    } catch { /* Not a gateway URL. */ }
  }
  const [image, setImage] = useState<{ source: string; src: string | null; failed: boolean } | null>(null)

  useEffect(() => {
    if (!source || !protectedImage) return
    const controller = new AbortController()
    let objectUrl: string | null = null
    setImage(null)
    void (async () => {
      try {
        const response = await apiFetch(source, {
          signal: controller.signal, credentials: 'include', redirect: 'error',
        })
        if (!response.ok) throw new Error(`Screenshot request failed (${response.status})`)
        const blob = await response.blob()
        if (!blob.type.startsWith('image/')) throw new Error('Screenshot response is not an image')
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setImage({ source, src: objectUrl, failed: false })
      } catch {
        if (!controller.signal.aborted) setImage({ source, src: null, failed: true })
      }
    })()
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [source, protectedImage])

  if (!protectedImage) return { src: source, failed: false }
  return image?.source === source ? image : { src: null, failed: false }
}
