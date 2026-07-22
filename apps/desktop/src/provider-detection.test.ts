import { describe, expect, it, vi } from 'vitest'
import { detectDesktopProviders, isSupportedDesktopProviderId } from './provider-detection.js'

describe('detectDesktopProviders', () => {
  it('advertises only implemented remote ACP adapters and gates both on local login', () => {
    const isInstalled = vi.fn(() => true)
    const isAuthenticated = vi.fn((binary: string) => binary === 'codex')

    expect(detectDesktopProviders(isInstalled, isAuthenticated)).toEqual([
      {
        id: 'codex',
        installed: true,
        authenticated: true,
        detail: 'Authenticated on this device',
      },
      {
        id: 'claude-code',
        installed: true,
        authenticated: false,
        detail: 'Login required on this device',
      },
    ])
    expect(isAuthenticated).toHaveBeenCalledWith('codex', ['login', 'status'])
    expect(isAuthenticated).toHaveBeenCalledWith('claude', ['auth', 'status'])
  })

  it('rejects provider IDs the desktop runner cannot execute', () => {
    expect(isSupportedDesktopProviderId('codex')).toBe(true)
    expect(isSupportedDesktopProviderId('claude-code')).toBe(true)
    expect(isSupportedDesktopProviderId('gemini')).toBe(false)
    expect(isSupportedDesktopProviderId('opencode')).toBe(false)
    expect(isSupportedDesktopProviderId('copilot')).toBe(false)
  })
})
