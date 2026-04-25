export type NoVncResizeMode = 'off' | 'scale' | 'remote'

export interface NoVncSessionOptions {
  viewerUrl?: string | null
  websocketUrl?: string | null
  viewOnly?: boolean
  shared?: boolean
  reconnect?: boolean
  reconnectDelayMs?: number
  resize?: NoVncResizeMode
  scaleViewport?: boolean
  quality?: number
  compression?: number
  bell?: boolean
}

const DEFAULT_VIEWER_URL = '/noVNC/vnc_lite.html'

function normalizeUrl(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function clampLevel(value: number | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null
  return Math.min(9, Math.max(0, Math.trunc(value)))
}

export function isWebSocketUrl(value?: string | null): boolean {
  const trimmed = normalizeUrl(value)
  return Boolean(trimmed && /^wss?:\/\//i.test(trimmed))
}

export function isNoVncViewerUrl(value?: string | null): boolean {
  const trimmed = normalizeUrl(value)
  return Boolean(trimmed && /\/(?:noVNC\/)?vnc(?:_lite)?\.html(?:[?#].*)?$/i.test(trimmed))
}

function usesQueryParams(viewerUrl: string): boolean {
  return /(?:^|\/)vnc_lite\.html(?:[?#].*)?$/i.test(viewerUrl)
}

export function buildNoVncViewerUrl(options: NoVncSessionOptions): string {
  const viewerUrl = normalizeUrl(options.viewerUrl) ?? DEFAULT_VIEWER_URL
  const websocketUrl = normalizeUrl(options.websocketUrl)
  if (!websocketUrl) return viewerUrl

  const params = new URLSearchParams()
  params.set('autoconnect', 'true')
  params.set('path', websocketUrl)

  if (options.viewOnly != null) params.set('view_only', options.viewOnly ? '1' : '0')
  if (options.shared != null) params.set('shared', options.shared ? '1' : '0')
  if (options.reconnect != null) params.set('reconnect', options.reconnect ? '1' : '0')
  if (options.reconnectDelayMs != null) params.set('reconnect_delay', String(Math.max(0, Math.trunc(options.reconnectDelayMs))))
  if (options.resize) params.set('resize', options.resize)
  if (options.scaleViewport != null) params.set('scale', options.scaleViewport ? '1' : '0')

  const quality = clampLevel(options.quality)
  if (quality != null) params.set('quality', String(quality))

  const compression = clampLevel(options.compression)
  if (compression != null) params.set('compression', String(compression))

  if (options.bell != null) params.set('bell', options.bell ? '1' : '0')

  const baseUrl = viewerUrl.split('#')[0] ?? viewerUrl
  if (usesQueryParams(baseUrl)) {
    const separator = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${separator}${params.toString()}`
  }
  return `${baseUrl}#${params.toString()}`
}
