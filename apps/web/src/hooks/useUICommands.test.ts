import { readFileSync } from 'node:fs'
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

describe('WebSocket reconnect state ordering', () => {
  it('flushes pending UI state before subscribing for the authoritative snapshot', () => {
    const source = readFileSync(new URL('./useUICommands.ts', import.meta.url), 'utf8')
    const onOpenStart = source.indexOf('ws.onopen = () => {')
    const onOpenEnd = source.indexOf('ws.onmessage = handleMessage', onOpenStart)
    const onOpen = source.slice(onOpenStart, onOpenEnd)

    expect(onOpen.indexOf('flushQueue(ws)')).toBeLessThan(onOpen.indexOf('subscribeToSession(ws, sid)'))
  })
})
