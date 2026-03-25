import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthToken, getAuthToken, setAuthToken } from './auth-token'

const localStorageMap = new Map<string, string>()
const sessionStorageMap = new Map<string, string>()

const createStorageMock = (store: Map<string, string>) => ({
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key)
  }),
  clear: vi.fn(() => {
    store.clear()
  }),
})

const localStorageMock = createStorageMock(localStorageMap)
const sessionStorageMock = createStorageMock(sessionStorageMap)

describe('auth-token', () => {
  beforeEach(() => {
    localStorageMap.clear()
    sessionStorageMap.clear()
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
    localStorageMock.removeItem.mockClear()
    sessionStorageMock.getItem.mockClear()
    sessionStorageMock.setItem.mockClear()
    sessionStorageMock.removeItem.mockClear()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: localStorageMock,
        sessionStorage: sessionStorageMock,
      },
    })
    clearAuthToken()
  })

  it('stores token in memory on set (web mode)', () => {
    setAuthToken('my-token')

    expect(getAuthToken()).toBe('my-token')
    // On web (no jaitDesktop), token is NOT stored in localStorage
    expect(localStorageMap.has('jait-auth-token')).toBe(false)
  })

  it('stores token in localStorage on native app', () => {
    // Simulate Electron
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: localStorageMock,
        sessionStorage: sessionStorageMock,
        jaitDesktop: { credentialStore: vi.fn().mockResolvedValue({ ok: true }), credentialClear: vi.fn().mockResolvedValue({ ok: true }) },
      },
    })

    setAuthToken('native-token')

    expect(getAuthToken()).toBe('native-token')
    expect(localStorageMap.get('jait-auth-token')).toBe('native-token')
  })

  it('clears in-memory token and all storage on logout', () => {
    setAuthToken('active-token')
    localStorageMap.set('jait-auth-token', 'leftover')
    localStorageMap.set('token', 'old-token')
    sessionStorageMap.set('jait-auth-token', 'session-token')

    clearAuthToken()

    expect(getAuthToken()).toBeNull()
    expect(localStorageMap.has('jait-auth-token')).toBe(false)
    expect(localStorageMap.has('token')).toBe(false)
    expect(sessionStorageMap.has('jait-auth-token')).toBe(false)
  })

  it('returns null when no token is set', () => {
    expect(getAuthToken()).toBeNull()
  })
})
