import type { BrowserSession } from '@/lib/browser-collaboration-api'

export interface SessionDetailItem {
  label: string
  value: string
}

function titleCaseKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

export function formatSessionMetadataValue(value: unknown): string {
  if (value == null) return 'Unknown'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => formatSessionMetadataValue(item)).join(', ')
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function getStorageProfileDetails(session: BrowserSession): SessionDetailItem[] {
  if (!session.storageProfile) return []
  return Object.entries(session.storageProfile).map(([key, value]) => ({
    label: `Storage ${titleCaseKey(key)}`,
    value: formatSessionMetadataValue(value),
  }))
}

export function getBrowserSessionOpenTarget(session: BrowserSession): string | null {
  return session.previewUrl ?? session.targetUrl ?? null
}

function isLoopbackPreviewUrl(target: string): boolean {
  if (target.startsWith('/api/dev-proxy/')) return true
  try {
    const parsed = new URL(target)
    return ['127.0.0.1', 'localhost', '0.0.0.0', '::1', '[::1]'].includes(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function canOpenLiveSessionInPreview(session: BrowserSession): boolean {
  const target = getBrowserSessionOpenTarget(session)
  if (!target) return false
  if (session.origin === 'managed' && Boolean(session.workspaceRoot?.trim())) return true
  return isLoopbackPreviewUrl(target)
}

export function getBrowserSessionDetails(session: BrowserSession): SessionDetailItem[] {
  const details: SessionDetailItem[] = [
    { label: 'Target', value: session.targetUrl ?? 'Unavailable' },
    { label: 'Live URL', value: session.previewUrl ?? 'Unavailable' },
    { label: 'Isolation', value: session.mode },
    { label: 'Origin', value: session.origin },
    { label: 'Controller', value: session.controller },
    { label: 'Workspace', value: session.workspaceRoot ?? 'Unavailable' },
  ]

  if (session.previewSessionId) {
    details.push({ label: 'Preview Session', value: session.previewSessionId })
  }
  if (session.browserId) {
    details.push({ label: 'Browser Surface', value: session.browserId })
  }

  return [...details, ...getStorageProfileDetails(session)]
}
