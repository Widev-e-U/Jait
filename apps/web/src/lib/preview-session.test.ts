import { describe, expect, it } from 'vitest'
import { deriveManagedPreviewSessionId, isSamePreviewSession, type PreviewSessionLike } from './preview-session'

function createSession(overrides: Partial<PreviewSessionLike> = {}): PreviewSessionLike {
  return {
    id: 'preview-session-1',
    status: 'ready',
    mode: 'local',
    target: '3000',
    command: 'bun run dev',
    port: 3000,
    url: '/api/dev-proxy/3000/',
    browserId: 'browser-1',
    processId: 1234,
    containerId: null,
    lastError: null,
    updatedAt: '2026-03-21T00:00:00.000Z',
    logs: [{ id: 1 }, { id: 2 }],
    browserEvents: [{ id: 10 }, { id: 11 }],
    ...overrides,
  }
}

describe('isSamePreviewSession', () => {
  it('treats identical preview snapshots as unchanged', () => {
    const session = createSession()
    expect(isSamePreviewSession(session, createSession())).toBe(true)
  })

  it('detects log growth as a meaningful change', () => {
    const previous = createSession()
    const next = createSession({ logs: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    expect(isSamePreviewSession(previous, next)).toBe(false)
  })

  it('detects browser event growth as a meaningful change', () => {
    const previous = createSession()
    const next = createSession({ browserEvents: [{ id: 10 }, { id: 11 }, { id: 12 }] })
    expect(isSamePreviewSession(previous, next)).toBe(false)
  })

  it('detects status changes as meaningful', () => {
    const previous = createSession()
    const next = createSession({ status: 'error', lastError: 'process exited' })
    expect(isSamePreviewSession(previous, next)).toBe(false)
  })
})

describe('deriveManagedPreviewSessionId', () => {
  it('creates an isolated nested preview session id', () => {
    expect(deriveManagedPreviewSessionId('session-123')).toBe('session-123::managed-preview')
  })

  it('returns null for empty session ids', () => {
    expect(deriveManagedPreviewSessionId('')).toBeNull()
    expect(deriveManagedPreviewSessionId('   ')).toBeNull()
    expect(deriveManagedPreviewSessionId(null)).toBeNull()
  })
})
