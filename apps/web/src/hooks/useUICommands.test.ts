import { readFileSync } from 'node:fs'
import { createElement, isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { resolveFsNodePlatform, shouldApplySessionScopedWsEvent, shouldReconnectUiSocketAfterWake, useUICommands } from '@/hooks/useUICommands'

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

const { effects, toastSuccess } = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  toastSuccess: vi.fn(),
}))

// SSR supplies real refs/callbacks; schedule its otherwise-skipped effects so
// the hook installs its real WebSocket notification handler without a DOM.
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => void | (() => void)) => { effects.push(effect) },
}))
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, info: vi.fn(), warning: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

it('renders completion identity through the gateway hook despite includeToast:false', async () => {
  const { setNativeNotificationsEnabled, setVisibleNotificationSession } = await import('@/lib/system-notifications')
  let receive: ((event: { data: string }) => void) | null = null
  class Socket {
    static OPEN = 1
    readyState = 1
    set onmessage(handler: ((event: { data: string }) => void) | null) { receive = handler }
    send() {}
    close() {}
  }
  vi.stubGlobal('WebSocket', Socket)
  vi.stubGlobal('window', Object.assign(new EventTarget(), { jaitDesktop: { notify: vi.fn(async () => {}) } }))
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)' })
  setNativeNotificationsEnabled(true)
  setVisibleNotificationSession(null)
  effects.length = 0
  toastSuccess.mockClear()
  const cleanups: Array<() => void> = []
  function Harness() {
    useUICommands({ listeners: {}, token: 'test-token', sessionId: 'other-chat' })
    return null
  }
  try {
    renderToStaticMarkup(createElement(Harness))
    for (const effect of effects.splice(0)) {
      const cleanup = effect()
      if (cleanup) cleanups.push(cleanup)
    }
    expect(receive).toBeTypeOf('function')
    const payload = {
      id: 'hook:identity:false', kind: 'completion', sessionId: 'agent-thread',
      title: 'Response ready', body: 'Refactor complete', level: 'success',
      includeToast: false,
    }
    const deliver = async (notification: Record<string, unknown>) => {
      receive!({ data: JSON.stringify({ type: 'notification', payload: notification }) })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    await deliver({ ...payload, agentId: 'lady', agentName: 'Lady Merge-a-Lot', agentAvatar: 'Pixel' })
    expect(toastSuccess).toHaveBeenCalledOnce()
    const rendered = toastSuccess.mock.calls[0]?.[0]
    expect(isValidElement(rendered)).toBe(true)
    const html = renderToStaticMarkup(rendered as ReactElement)
    expect(html).toContain('data-agent-avatar="Pixel"')
    expect(html).toContain('Lady Merge-a-Lot')

    // Suppression still applies to ordinary completions.
    toastSuccess.mockClear()
    await deliver({ ...payload, id: 'hook:plain:false' })
    expect(toastSuccess).not.toHaveBeenCalled()
    await deliver({ ...payload, id: 'hook:plain:true', includeToast: true })
    expect(toastSuccess.mock.calls).toEqual([
      ['Response ready', expect.objectContaining({ id: 'hook:plain:true', description: 'Refactor complete' })],
    ])
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup()
    effects.length = 0
    vi.unstubAllGlobals()
  }
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
