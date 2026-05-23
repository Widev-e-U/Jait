import { getApiUrl } from '@/lib/gateway-url'

const IMAGE_FILE_RE = /\.(?:png|jpe?g|gif|webp)$/i

function hasExplicitScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

function isGatewayRelativeAsset(value: string): boolean {
  return value.startsWith('/api/browser/screenshot') || value.startsWith('/api/dev-proxy/')
}

function isProjectImagePath(value: string): boolean {
  return (
    IMAGE_FILE_RE.test(value)
    && (
      value.startsWith('/')
      || value.startsWith('./')
      || value.startsWith('../')
      || value.includes('/')
      || value.includes('\\')
    )
  )
}

export function resolveChatImageUrl(src: string, apiUrl = getApiUrl()): string | null {
  const trimmed = src.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('data:image/') || trimmed.startsWith('blob:')) {
    return trimmed
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (isGatewayRelativeAsset(trimmed)) {
    return `${apiUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`
  }

  if (hasExplicitScheme(trimmed)) {
    return null
  }

  if (isProjectImagePath(trimmed)) {
    return `${apiUrl}/api/browser/screenshot?path=${encodeURIComponent(trimmed)}`
  }

  return null
}
