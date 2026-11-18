import { useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { apiFetch } from '@/lib/api-fetch'
import { getApiUrl } from '@/lib/gateway-url'

/** Only relative, dedicated gateway URLs may send authenticated download requests. */
export function parseFileDownloadLink(href?: string): { path: string; query: string } | null {
  if (!href?.startsWith('/api/project/download?')) return null
  const params = new URLSearchParams(href.slice(href.indexOf('?') + 1))
  const path = params.get('path')
  if (!path || params.getAll('path').length !== 1) return null
  const clean = new URLSearchParams({ path })
  const surfaceId = params.get('surfaceId')
  if (surfaceId) clean.set('surfaceId', surfaceId)
  return { path, query: clean.toString() }
}

export function FileDownloadLink({ href, children }: { href: string; children?: ReactNode }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const target = parseFileDownloadLink(href)
  if (!target) return null
  const filename = target.path.replace(/\\/g, '/').split('/').pop() || 'download'
  return <span className="inline-flex max-w-full flex-wrap items-center gap-1">
    <a href={href} download={filename} aria-label={`Download ${filename}`} aria-disabled={busy}
      className="inline-flex cursor-pointer items-center gap-1 text-primary underline underline-offset-2"
      onClick={async event => {
        event.preventDefault()
        event.stopPropagation()
        if (busy) return
        setBusy(true)
        setError(null)
        try {
          const response = await apiFetch(`${getApiUrl()}/api/project/download?${target.query}`, {
            credentials: 'include', redirect: 'error',
          })
          if (!response.ok) {
            const details = await response.json().catch(() => null)
            throw new Error(details?.message || `Download failed (${response.status})`)
          }
          const url = URL.createObjectURL(await response.blob())
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = filename
          document.body.append(anchor)
          anchor.click()
          anchor.remove()
          // Let the browser consume the object URL before releasing it.
          setTimeout(() => URL.revokeObjectURL(url), 30_000)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Download failed')
        } finally {
          setBusy(false)
        }
      }}><Download className="h-3.5 w-3.5 shrink-0" />{busy ? 'Downloading…' : (children ?? 'Download')}</a>
    {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
  </span>
}
