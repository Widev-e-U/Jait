import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthToken, getAuthToken, setAuthToken } from './auth-token'

const sessionStorageMap = new Map<string, string>()
const localStorageMap = new Map<string, string>()

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

const sessionStorageMock = createStorageMock(sessionStorageMap)
const localStorageMock = createStorageMock(localStorageMap)

describe('auth-token', () => {
  beforeEach(() => {
    sessionStorageMap.clear()
    localStorageMap.clear()
    sessionStorageMock.getItem.mockClear()
    sessionStorageMock.setItem.mockClear()
    sessionStorageMock.removeItem.mockClear()
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
    localStorageMock.removeItem.mockClear()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
      sessionStorage: sessionStorageMock,
      localStorage: localStorageMock,
      },
    })
    clearAuthToken()
  })

  it('stores tokens in sessionStorage instead of localStorage', () => {
    setAuthToken('session-token')

    expect(getAuthToken()).toBe('session-token')
    expect(sessionStorageMap.get('jait-auth-token')).toBe('session-token')
    expect(localStorageMap.get('token')).toBeUndefined()
  })

  it('migrates legacy localStorage tokens on read', () => {
    localStorageMap.set('token', 'legacy-token')

    expect(getAuthToken()).toBe('legacy-token')
    expect(sessionStorageMap.get('jait-auth-token')).toBe('legacy-token')
    expect(localStorageMap.get('token')).toBeUndefined()
  })

  it('clears both new and legacy token locations on logout', () => {
    sessionStorageMap.set('jait-auth-token', 'new-token')
    localStorageMap.set('token', 'old-token')

    clearAuthToken()

    expect(getAuthToken()).toBeNull()
    expect(sessionStorageMap.size).toBe(0)
    expect(localStorageMap.size).toBe(0)
  })
})
