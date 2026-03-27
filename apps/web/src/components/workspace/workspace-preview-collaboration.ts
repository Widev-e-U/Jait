import type { BrowserIntervention, BrowserSession } from '@/lib/browser-collaboration-api'

interface ResolvePreviewBrowserSessionInput {
  sessions: BrowserSession[]
  previewBrowserSessionId?: string | null
  previewSessionId?: string | null
  managedBrowserId?: string | null
  previewTarget?: string | null
}

function normalize(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function matchesTarget(session: BrowserSession, target: string | null): boolean {
  if (!target) return false
  return session.previewUrl === target || session.targetUrl === target
}

export function resolvePreviewBrowserSession(input: ResolvePreviewBrowserSessionInput): BrowserSession | null {
  const previewBrowserSessionId = normalize(input.previewBrowserSessionId)
  if (previewBrowserSessionId) {
    return input.sessions.find((session) => session.id === previewBrowserSessionId) ?? null
  }

  const previewSessionId = normalize(input.previewSessionId)
  if (previewSessionId) {
    const byPreviewSession = input.sessions.find((session) => session.previewSessionId === previewSessionId)
    if (byPreviewSession) return byPreviewSession
  }

  const managedBrowserId = normalize(input.managedBrowserId)
  if (managedBrowserId) {
    const byBrowserId = input.sessions.find((session) => session.browserId === managedBrowserId)
    if (byBrowserId) return byBrowserId
  }

  const previewTarget = normalize(input.previewTarget)
  if (previewTarget) {
    return input.sessions.find((session) => matchesTarget(session, previewTarget)) ?? null
  }

  return null
}

export function getOpenInterventionsForSession(
  browserSessionId: string | null | undefined,
  interventions: BrowserIntervention[],
): BrowserIntervention[] {
  if (!browserSessionId) return []
  return interventions.filter((item) => item.browserSessionId === browserSessionId && item.status === 'open')
}
