import { describe, expect, it } from 'vitest'

import { shouldApplySessionScopedWsEvent } from '@/hooks/useUICommands'

describe('shouldApplySessionScopedWsEvent', () => {
  it('rejects a delayed full-state packet from the previously open chat', () => {
    expect(shouldApplySessionScopedWsEvent('chat-low', 'chat-high')).toBe(false)
  })

  it('accepts state and lifecycle packets for the active chat', () => {
    expect(shouldApplySessionScopedWsEvent('chat-high', 'chat-high')).toBe(true)
  })
})
