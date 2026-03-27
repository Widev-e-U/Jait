import { describe, expect, it } from 'vitest'

import type { BrowserIntervention, BrowserSession } from '@/lib/browser-collaboration-api'
import { getOpenInterventionsForSession, resolvePreviewBrowserSession } from './workspace-preview-collaboration'

function makeSession(overrides: Partial<BrowserSession> = {}): BrowserSession {
  return {
    id: 'browser-session-1',
    name: 'preview-session',
    workspaceRoot: '/workspace/app',
    targetUrl: 'http://127.0.0.1:3000/',
    previewUrl: '/api/dev-proxy/3000/',
    previewSessionId: 'preview-session-1',
    browserId: 'browser-1',
    mode: 'isolated',
    origin: 'managed',
    controller: 'agent',
    status: 'ready',
    secretSafe: false,
    storageProfile: null,
    createdBy: 'user-1',
    createdAt: '2026-03-27T00:00:00.000Z',
    updatedAt: '2026-03-27T00:00:00.000Z',
    ...overrides,
  }
}

function makeIntervention(overrides: Partial<BrowserIntervention> = {}): BrowserIntervention {
  return {
    id: 'intervention-1',
    browserSessionId: 'browser-session-1',
    threadId: null,
    chatSessionId: null,
    kind: 'custom',
    reason: 'Sign in',
    instructions: 'Complete login',
    status: 'open',
    secretSafe: false,
    allowUserNote: true,
    requestedBy: 'user-1',
    resolvedBy: null,
    userNote: null,
    requestedAt: '2026-03-27T00:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  }
}

describe('workspace preview collaboration helpers', () => {
  it('prefers an explicitly selected browser session id', () => {
    const sessions = [makeSession(), makeSession({ id: 'browser-session-2', previewSessionId: 'preview-session-2' })]
    expect(resolvePreviewBrowserSession({
      sessions,
      previewBrowserSessionId: 'browser-session-2',
      previewSessionId: 'preview-session-1',
    })?.id).toBe('browser-session-2')
  })

  it('falls back through preview session, browser id, and target matching', () => {
    const session = makeSession()
    const sessions = [session]

    expect(resolvePreviewBrowserSession({ sessions, previewSessionId: 'preview-session-1' })?.id).toBe(session.id)
    expect(resolvePreviewBrowserSession({ sessions, managedBrowserId: 'browser-1' })?.id).toBe(session.id)
    expect(resolvePreviewBrowserSession({ sessions, previewTarget: '/api/dev-proxy/3000/' })?.id).toBe(session.id)
  })

  it('returns only open interventions for the active session', () => {
    const interventions = [
      makeIntervention(),
      makeIntervention({ id: 'intervention-2', status: 'resolved' }),
      makeIntervention({ id: 'intervention-3', browserSessionId: 'browser-session-2' }),
    ]

    expect(getOpenInterventionsForSession('browser-session-1', interventions).map((item) => item.id)).toEqual(['intervention-1'])
  })
})
