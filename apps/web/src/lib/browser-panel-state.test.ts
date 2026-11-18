import { afterEach, describe, expect, it, vi } from 'vitest'

describe('browser panel state', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('restores each chat’s minimized choice after a page reload', async () => {
    const entries = new Map<string, string>()
    vi.stubGlobal('window', { sessionStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    } })
    const beforeReload = await import('./browser-panel-state')
    beforeReload.rememberBrowserCollapsed('chat-a', true)
    beforeReload.rememberBrowserCollapsed('chat-b', false)
    vi.resetModules()
    const afterReload = await import('./browser-panel-state')
    expect(afterReload.readBrowserCollapsed('chat-a')).toBe(true)
    expect(afterReload.readBrowserCollapsed('chat-b')).toBe(false)
    expect(afterReload.readBrowserCollapsed('chat-c')).toBeUndefined()
  })

  it('keeps the choice in memory when session storage is blocked', async () => {
    vi.stubGlobal('window', { get sessionStorage() { throw new Error('blocked') } })
    const state = await import('./browser-panel-state')
    state.rememberBrowserCollapsed('chat-a', true)
    expect(state.readBrowserCollapsed('chat-a')).toBe(true)
  })
})
