import { describe, expect, it } from 'vitest'

import {
  createSessionStatePersistRequestInit,
  getSessionStateRequestKey,
  isSessionStateLoading,
  shouldApplySessionStateFetchResult,
} from '@/hooks/useSessionState'

describe('shouldApplySessionStateFetchResult', () => {
  it('applies fetch results when no newer local write happened', () => {
    expect(shouldApplySessionStateFetchResult(0, 0)).toBe(true)
    expect(shouldApplySessionStateFetchResult(3, 3)).toBe(true)
  })

  it('ignores stale fetch results after a local optimistic update', () => {
    expect(shouldApplySessionStateFetchResult(0, 1)).toBe(false)
    expect(shouldApplySessionStateFetchResult(2, 5)).toBe(false)
  })
})

describe('createSessionStatePersistRequestInit', () => {
  it('builds the PATCH request payload for persisted session state', async () => {
    const init = createSessionStatePersistRequestInit('token-123', 'chat.mode', 'agent')

    expect(init.method).toBe('PATCH')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-123',
    })
    expect(init.keepalive).toBeUndefined()

    const request = new Request('http://localhost/session-state', init)
    await expect(request.text()).resolves.toBe(JSON.stringify({ 'chat.mode': 'agent' }))
  })

  it('serializes object payloads for DB-backed session state', async () => {
    const init = createSessionStatePersistRequestInit('token-123', 'manager.selectedRepo', {
      repoId: 'repo-123',
      localPath: '/work/repo',
    })

    const request = new Request('http://localhost/session-state', init)
    await expect(request.text()).resolves.toBe(JSON.stringify({
      'manager.selectedRepo': {
        repoId: 'repo-123',
        localPath: '/work/repo',
      },
    }))
  })
})

describe('session state loading helpers', () => {
  it('builds a stable request key only when session auth is available', () => {
    expect(getSessionStateRequestKey('session-1', 'manager.selectedRepo', 'token-1')).toBe('session-1:manager.selectedRepo:token-1')
    expect(getSessionStateRequestKey(null, 'manager.selectedRepo', 'token-1')).toBeNull()
    expect(getSessionStateRequestKey('session-1', 'manager.selectedRepo', null)).toBeNull()
  })

  it('keeps session state loading until the current request has completed', () => {
    const requestKey = getSessionStateRequestKey('session-1', 'manager.selectedRepo', 'token-1')

    expect(isSessionStateLoading(false, requestKey, null)).toBe(true)
    expect(isSessionStateLoading(false, requestKey, 'session-1:manager.selectedRepo:token-1')).toBe(false)
    expect(isSessionStateLoading(true, requestKey, 'session-1:manager.selectedRepo:token-1')).toBe(true)
    expect(isSessionStateLoading(false, null, null)).toBe(false)
  })
})
