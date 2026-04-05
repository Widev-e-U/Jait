import { describe, expect, it } from 'vitest'

import {
  createSessionStatePersistRequestInit,
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
})
