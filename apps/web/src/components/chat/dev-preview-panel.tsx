import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Globe, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getApiUrl } from '@/lib/gateway-url'

interface DevPreviewPanelProps {
  onClose: () => void
  initialTarget?: string | null
  autoOpenKey?: number
}

interface ResolvedPreviewTarget {
  iframeSrc: string
  label: string
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized === '[::1]'
}

export function resolvePreviewTarget(input: string): ResolvedPreviewTarget | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    const port = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(port) || port < 1 || port > 65535) return null
    return {
      iframeSrc: `${getApiUrl()}/api/dev-proxy/${port}/`,
      label: `localhost:${port}`,
    }
  }

  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }

  if (!isLoopbackHost(url.hostname)) return null

  const port = Number.parseInt(url.port, 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) return null

  const path = `${url.pathname || '/'}${url.search}${url.hash}`
  return {
    iframeSrc: `${getApiUrl()}/api/dev-proxy/${port}${path.startsWith('/') ? path : `/${path}`}`,
    label: `${url.hostname}:${port}${url.pathname || '/'}`,
  }
}

export function DevPreviewPanel({ onClose, initialTarget = null, autoOpenKey = 0 }: DevPreviewPanelProps) {
  const [input, setInput] = useState(initialTarget?.trim() || '3000')
  const [activeSrc, setActiveSrc] = useState<string | null>(null)
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const [frameKey, setFrameKey] = useState(0)

  const resolved = useMemo(() => resolvePreviewTarget(input), [input])

  const openPreview = () => {
    if (!resolved) return
    setActiveSrc(resolved.iframeSrc)
    setActiveLabel(resolved.label)
    setFrameKey((prev) => prev + 1)
  }

  useEffect(() => {
    const next = initialTarget?.trim()
    if (!next) return
    setInput(next)
  }, [initialTarget])

  useEffect(() => {
    if (!initialTarget?.trim()) return
    const nextResolved = resolvePreviewTarget(initialTarget)
    if (!nextResolved) return
    setActiveSrc(nextResolved.iframeSrc)
    setActiveLabel(nextResolved.label)
    setFrameKey((prev) => prev + 1)
  }, [initialTarget, autoOpenKey])

  const reloadPreview = () => {
    if (!activeSrc) return
    setFrameKey((prev) => prev + 1)
  }

  return (
    <section className="shrink-0 border-b bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Dev Preview</span>
          {activeLabel ? (
            <span className="truncate text-xs text-muted-foreground" title={activeLabel}>
              {activeLabel}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {activeSrc ? (
            <>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={reloadPreview}>
                <RefreshCw className="mr-1 h-3 w-3" />
                Reload
              </Button>
              <a href={activeSrc} target="_blank" rel="noreferrer" className="inline-flex">
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Open
                </Button>
              </a>
            </>
          ) : null}
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-b bg-muted/10 px-3 py-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="3000 or http://localhost:3000"
            className="h-8"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && resolved) {
                event.preventDefault()
                openPreview()
              }
            }}
          />
          <Button type="button" size="sm" className="h-8 shrink-0" onClick={openPreview} disabled={!resolved}>
            Open Preview
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Supports `localhost`, `127.0.0.1`, `0.0.0.0`, and `::1` ports through the gateway proxy. Reload manually if your dev server changes.
        </p>
      </div>

      <div className="h-[360px] bg-muted/5">
        {activeSrc ? (
          <iframe
            key={frameKey}
            src={activeSrc}
            title="Local dev preview"
            className="h-full w-full bg-white"
            sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Enter a local dev server port or localhost URL to open it here.
          </div>
        )}
      </div>
    </section>
  )
}
