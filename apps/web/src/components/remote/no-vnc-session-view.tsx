import type { ReactNode } from 'react'
import { buildNoVncViewerUrl, isNoVncViewerUrl, isWebSocketUrl, type NoVncResizeMode, type NoVncSessionOptions } from '@/lib/no-vnc'

export interface NoVncSessionViewProps extends NoVncSessionOptions {
  source?: string | null
  title?: string
  className?: string
  overlay?: ReactNode
  onLoad?: () => void
}

export function resolveNoVncSessionUrl(source: string | null | undefined, options: NoVncSessionOptions = {}): string | null {
  const trimmed = source?.trim()
  if (!trimmed) return null
  if (isWebSocketUrl(trimmed)) {
    return buildNoVncViewerUrl({ ...options, websocketUrl: trimmed })
  }
  if (isNoVncViewerUrl(trimmed)) return trimmed
  return trimmed
}

export function NoVncSessionView({
  source,
  viewerUrl,
  websocketUrl,
  viewOnly,
  shared,
  reconnect,
  reconnectDelayMs,
  resize,
  scaleViewport,
  quality,
  compression,
  bell,
  title = 'Remote session',
  className = 'h-full w-full bg-white',
  overlay,
  onLoad,
}: NoVncSessionViewProps) {
  const src = resolveNoVncSessionUrl(source, {
    viewerUrl,
    websocketUrl,
    viewOnly,
    shared,
    reconnect,
    reconnectDelayMs,
    resize,
    scaleViewport,
    quality,
    compression,
    bell,
  })

  if (!src) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No remote session source available.
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <iframe
        src={src}
        title={title}
        className={className}
        sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
        onLoad={onLoad}
      />
      {overlay ? (
        <div className="absolute left-2 top-2 rounded bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow">
          {overlay}
        </div>
      ) : null}
    </div>
  )
}

export type { NoVncResizeMode }
