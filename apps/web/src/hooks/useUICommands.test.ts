import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { resolveFsNodePlatform, shouldApplySessionScopedWsEvent } from '@/hooks/useUICommands'

describe('shouldApplySessionScopedWsEvent', () => {
  it('rejects a delayed full-state packet from the previously open chat', () => {
    expect(shouldApplySessionScopedWsEvent('chat-low', 'chat-high')).toBe(false)
  })

  it('accepts state and lifecycle packets for the active chat', () => {
    expect(shouldApplySessionScopedWsEvent('chat-high', 'chat-high')).toBe(true)
  })
})

describe('desktop filesystem node platform', () => {
  it('uses Tauri native win32 identity when WebView reports an empty platform', () => {
    expect(resolveFsNodePlatform('electron', 'win32', '')).toBe('windows')
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
