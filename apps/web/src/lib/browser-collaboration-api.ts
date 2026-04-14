import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

export type BrowserSessionController = 'agent' | 'user' | 'observer'
export type BrowserSessionStatus = 'ready' | 'running' | 'paused' | 'intervention-required' | 'closed'

export interface BrowserSession {
  id: string
  name: string
  workspaceRoot: string | null
  targetUrl: string | null
  previewUrl: string | null
  previewSessionId: string | null
  browserId: string | null
  mode: 'shared' | 'isolated'
  origin: 'attached' | 'managed' | 'direct'
  controller: BrowserSessionController
  status: BrowserSessionStatus
  secretSafe: boolean
  storageProfile: Record<string, unknown> | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface BrowserIntervention {
  id: string
  browserSessionId: string
  threadId: string | null
  chatSessionId: string | null
  kind: 'complete_login' | 'enter_secret' | 'dismiss_modal' | 'confirm_external_prompt' | 'custom'
  reason: string
  instructions: string
  status: 'open' | 'resolved' | 'cancelled'
  secretSafe: boolean
  allowUserNote: boolean
  requestedBy: string | null
  resolvedBy: string | null
  userNote: string | null
  requestedAt: string
  resolvedAt: string | null
}

export interface BrowserInterventionResumeResult {
  chat?: { status: 'steered' | 'not-running' | 'error'; error?: string }
  thread?: { status: 'queued' | 'not-running' | 'error'; error?: string }
}

function headers(token?: string | null, withJsonBody = false): HeadersInit {
  const next: HeadersInit = {}
  if (withJsonBody) next['Content-Type'] = 'application/json'
  if (token) next['Authorization'] = `Bearer ${token}`
  return next
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const fallbackMessage = (res.statusText || '').trim() || `Request failed (HTTP ${res.status})`
    const error = await res.json().catch(() => ({ error: fallbackMessage }))
    throw new Error(
      (error as { error?: string; detail?: string }).error?.trim()
      || (error as { detail?: string }).detail?.trim()
      || fallbackMessage,
    )
  }
  return await res.json() as T
}

export const browserCollaborationApi = {
  async listSessions(token?: string | null) {
    const res = await fetch(`${API_URL}/api/browser/sessions`, { headers: headers(token) })
    return parseJson<{ sessions: BrowserSession[] }>(res)
  },
  async listInterventions(token?: string | null, status: 'open' | 'resolved' | 'cancelled' | 'all' = 'open') {
    const suffix = status === 'all' ? '' : `?status=${status}`
    const res = await fetch(`${API_URL}/api/browser/interventions${suffix}`, { headers: headers(token) })
    return parseJson<{ interventions: BrowserIntervention[] }>(res)
  },
  async takeControl(browserSessionId: string, token?: string | null) {
    const res = await fetch(`${API_URL}/api/browser/sessions/${browserSessionId}/take-control`, {
      method: 'POST',
      headers: headers(token),
    })
    return parseJson<{ session: BrowserSession }>(res)
  },
  async returnControl(browserSessionId: string, token?: string | null) {
    const res = await fetch(`${API_URL}/api/browser/sessions/${browserSessionId}/return-control`, {
      method: 'POST',
      headers: headers(token),
    })
    return parseJson<{ session: BrowserSession }>(res)
  },
  async resume(browserSessionId: string, token?: string | null) {
    const res = await fetch(`${API_URL}/api/browser/sessions/${browserSessionId}/resume`, {
      method: 'POST',
      headers: headers(token),
    })
    return parseJson<{ session: BrowserSession }>(res)
  },
  async resolveIntervention(interventionId: string, token?: string | null, userNote?: string) {
    const res = await fetch(`${API_URL}/api/browser/interventions/${interventionId}/resolve`, {
      method: 'POST',
      headers: headers(token, true),
      body: JSON.stringify({ userNote: userNote ?? '' }),
    })
    return parseJson<{ intervention: BrowserIntervention; resume?: BrowserInterventionResumeResult }>(res)
  },
}
