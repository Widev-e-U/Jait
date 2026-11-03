import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { resolveFsNodePlatform, shouldApplySessionScopedWsEvent, shouldReconnectUiSocketAfterWake } from '@/hooks/useUICommands'

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
    expect(resolveFsNodePlatform('desktop', 'win32', '')).toBe('windows')
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

describe('UI socket wake reconnect', () => {
  const wake = { isAlwaysOnNode: false, hidden: false, hasSocket: true, sinceLastWakeReconnectMs: 60_000 }

  it('replaces a socket that still looks open after an Android resume', () => {
    expect(shouldReconnectUiSocketAfterWake(wake)).toBe(true)
  })

  it('opens only one fresh socket when resume and visibilitychange fire together', () => {
    expect(shouldReconnectUiSocketAfterWake({ ...wake, sinceLastWakeReconnectMs: 300 })).toBe(false)
    // Visibility always reconnects, and no socket at all is never deduplicated.
    expect(shouldReconnectUiSocketAfterWake({ ...wake, sinceLastWakeReconnectMs: 300, force: true })).toBe(true)
    expect(shouldReconnectUiSocketAfterWake({ ...wake, sinceLastWakeReconnectMs: 300, hasSocket: false })).toBe(true)
  })

  it('leaves hidden documents and always-on desktop nodes alone', () => {
    expect(shouldReconnectUiSocketAfterWake({ ...wake, hidden: true, force: true })).toBe(false)
    expect(shouldReconnectUiSocketAfterWake({ ...wake, isAlwaysOnNode: true })).toBe(false)
  })
})
