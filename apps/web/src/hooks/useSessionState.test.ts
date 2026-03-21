import { describe, expect, it } from 'vitest'

import { shouldApplySessionStateFetchResult } from '@/hooks/useSessionState'

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
