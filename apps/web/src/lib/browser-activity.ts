import { normalizeToolName } from './tool-call-body'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function browserPageUrl(value: unknown): string | null {
  try {
    const url = new URL(text(value))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.username = ''
    url.password = ''
    return url.href
  } catch {
    return null
  }
}

export function getBrowserActivity(tool: string, args: Record<string, unknown>, data?: Record<string, unknown>) {
  const payload = data ?? {}
  const session = record(payload.browserSession)
  const suppressed = payload.captureSuppressed === true || payload.secretSafe === true || session.secretSafe === true
  const snapshot = text(payload.snapshot)
  const title = text(payload.title) || /^Title:\s*(.+)$/m.exec(snapshot)?.[1]?.trim() || ''
  const url = browserPageUrl(payload.url ?? args.url ?? /^URL:\s*(.+)$/m.exec(snapshot)?.[1])
  const elements = suppressed || !Array.isArray(payload.interactiveElements) ? [] : payload.interactiveElements.flatMap((value) => {
    const element = record(value)
    const label = text(element.name) || text(element.text) || text(element.placeholder) || text(element.selector)
    return label ? [{ label, role: text(element.role) || text(element.tagName), disabled: element.disabled === true, active: element.active === true }] : []
  })
  const selector = text(args.selector)
  const action = normalizeToolName(tool).replace(/^browser\./, '')
  const target = action === 'scroll'
    ? `x: ${typeof args.x === 'number' ? args.x : 0}, y: ${typeof args.y === 'number' ? args.y : 0}`
    : selector
  const obstruction = record(payload.obstruction)
  const notice = suppressed
    ? 'Page capture is hidden while this browser session is secret-safe.'
    : obstruction.hasModal === true ? `Dialog open${text(obstruction.activeDialogTitle) ? `: ${text(obstruction.activeDialogTitle)}` : ''}` : ''
  return { title, url, target: suppressed ? '' : target, elements, suppressed, notice, textPreview: suppressed ? '' : text(payload.textPreview), snapshot: suppressed ? '' : snapshot }
}
