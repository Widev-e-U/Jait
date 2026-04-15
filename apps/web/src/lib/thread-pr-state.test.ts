import { describe, expect, it } from 'vitest'

import { resolveThreadPrStateFromPoll } from './thread-pr-state'

describe('resolveThreadPrStateFromPoll', () => {
  it('uses the live PR state when polling finds a PR', () => {
    expect(resolveThreadPrStateFromPoll({ state: 'merged' }, 'open')).toBe('merged')
    expect(resolveThreadPrStateFromPoll({ state: 'closed' }, 'creating')).toBe('closed')
  })

  it('keeps persisted open state when polling cannot see the PR', () => {
    expect(resolveThreadPrStateFromPoll(null, 'open')).toBe('open')
  })

  it('keeps creating state while PR creation is still in flight', () => {
    expect(resolveThreadPrStateFromPoll(undefined, 'creating')).toBe('creating')
  })

  it('returns null when neither polling nor persistence has PR state', () => {
    expect(resolveThreadPrStateFromPoll(null, null)).toBeNull()
  })
})
