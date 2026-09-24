/**
 * Tests for device identification utilities.
 *
 * Covers:
 * - Platform detection (desktop, capacitor, web)
 * - Device ID generation format
 * - localStorage persistence (web/capacitor)
 * - Desktop desktop-settings.json persistence via IPC
 * - Migration from localStorage to Desktop settings
 * - Module-level cache behaviour
 * - Sync fallback when initDeviceId hasn't been called
 */

// We need to reset module state between tests since device-id.ts has module-level cache.
// Use dynamic import after resetting modules.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock localStorage
const localStorageMap = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageMap.set(key, value) }),
  removeItem: vi.fn((key: string) => { localStorageMap.delete(key) }),
  clear: vi.fn(() => { localStorageMap.clear() }),
}

// Keep a reference to the window mock we can mutate per test
let windowMock: Record<string, unknown> = {}

beforeEach(() => {
  localStorageMap.clear()
  vi.restoreAllMocks()
  windowMock = {}

  // Reset the global mocks
  vi.stubGlobal('localStorage', localStorageMock)
  vi.stubGlobal('window', windowMock)

  // Reset module cache so _cachedDeviceId is cleared between tests
  vi.resetModules()
})

async function loadModule() {
  return await import('./device-id')
}

describe('detectPlatform', () => {
  it('returns "desktop" when jaitDesktop is present', async () => {
    windowMock.jaitDesktop = {}
    const { detectPlatform } = await loadModule()
    expect(detectPlatform()).toBe('desktop')
  })

  it('returns "capacitor" when the native bridge is present', async () => {
    windowMock.Capacitor = { isNativePlatform: () => true }
    const { detectPlatform } = await loadModule()
    expect(detectPlatform()).toBe('capacitor')
  })

  it('does not mistake a bundled Capacitor global for the native app', async () => {
    windowMock.Capacitor = { isNativePlatform: () => false }
    const { detectPlatform } = await loadModule()
    expect(detectPlatform()).toBe('web')
  })

  it('returns "web" by default', async () => {
    const { detectPlatform } = await loadModule()
    expect(detectPlatform()).toBe('web')
  })

  it('prefers desktop over capacitor when both are present', async () => {
    windowMock.jaitDesktop = {}
    windowMock.Capacitor = {}
    const { detectPlatform } = await loadModule()
    expect(detectPlatform()).toBe('desktop')
  })
})

describe('generateDeviceId (sync)', () => {
  it('generates an ID with platform prefix, timestamp, and random suffix', async () => {
    const { generateDeviceId } = await loadModule()
    const id = generateDeviceId()
    expect(id).toMatch(/^web-[a-z0-9]+-[a-z0-9]+$/)
  })

  it('stores the generated ID in localStorage', async () => {
    const { generateDeviceId } = await loadModule()
    generateDeviceId()
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'jait-device-id-web',
      expect.stringMatching(/^web-/),
    )
  })

  it('returns the same ID on subsequent calls', async () => {
    const { generateDeviceId } = await loadModule()
    const first = generateDeviceId()
    const second = generateDeviceId()
    expect(first).toBe(second)
  })

  it('returns a stored ID from localStorage without generating a new one', async () => {
    localStorageMap.set('jait-device-id-web', 'web-existing-abc123')
    const { generateDeviceId } = await loadModule()
    const id = generateDeviceId()
    expect(id).toBe('web-existing-abc123')
  })

  it('uses desktop prefix on Desktop platform', async () => {
    windowMock.jaitDesktop = {}
    const { generateDeviceId } = await loadModule()
    const id = generateDeviceId()
    expect(id).toMatch(/^desktop-/)
  })

  it('uses capacitor prefix on Capacitor platform', async () => {
    windowMock.Capacitor = { isNativePlatform: () => true }
    const { generateDeviceId } = await loadModule()
    const id = generateDeviceId()
    expect(id).toMatch(/^capacitor-/)
  })

  it('falls back to an in-memory ID when localStorage access throws', async () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })

    const { generateDeviceId } = await loadModule()
    const id = generateDeviceId()

    expect(id).toMatch(/^web-/)
  })
})

describe('initDeviceId (async)', () => {
  it('keeps the Android node ID after WebView storage is cleared', async () => {
    let nativeId: string | null = null
    const getOrCreateDeviceId = vi.fn(async ({ candidate }: { candidate: string | null }) => {
      nativeId ??= candidate ?? 'capacitor-native-1'
      return { deviceId: nativeId }
    })
    windowMock.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: { AgentOverlay: { getOrCreateDeviceId } },
    }
    localStorageMap.set('jait-device-id-capacitor', 'capacitor-existing-1')
    const first = await (await loadModule()).initDeviceId()
    expect(first).toBe('capacitor-existing-1')

    vi.resetModules()
    localStorageMap.clear()
    const second = await (await loadModule()).initDeviceId()
    expect(second).toBe(first)
    expect(getOrCreateDeviceId).toHaveBeenLastCalledWith({ candidate: null })
  })

  describe('web platform', () => {
    it('generates and stores a new ID when nothing exists', async () => {
      const { initDeviceId } = await loadModule()
      const id = await initDeviceId()
      expect(id).toMatch(/^web-/)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('jait-device-id-web', id)
    })

    it('returns existing localStorage ID', async () => {
      localStorageMap.set('jait-device-id-web', 'web-stored-xyz789')
      const { initDeviceId } = await loadModule()
      const id = await initDeviceId()
      expect(id).toBe('web-stored-xyz789')
    })

    it('caches the result for subsequent sync calls', async () => {
      const { initDeviceId, generateDeviceId } = await loadModule()
      const initId = await initDeviceId()
      const syncId = generateDeviceId()
      expect(syncId).toBe(initId)
    })

    it('returns cached value on second call without re-reading localStorage', async () => {
      const { initDeviceId } = await loadModule()
      const first = await initDeviceId()
      // Clear localStorage — should still return cached
      localStorageMap.clear()
      const second = await initDeviceId()
      expect(second).toBe(first)
    })

    it('generates an ID when localStorage is unavailable', async () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('storage blocked')
      })
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('storage blocked')
      })

      const { initDeviceId } = await loadModule()
      const id = await initDeviceId()

      expect(id).toMatch(/^web-/)
    })
  })

  describe('desktop platform', () => {
    let mockGetSetting: ReturnType<typeof vi.fn>
    let mockSetSetting: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockGetSetting = vi.fn()
      mockSetSetting = vi.fn().mockResolvedValue({ ok: true })
      windowMock.jaitDesktop = {
        getSetting: mockGetSetting,
        setSetting: mockSetSetting,
      }
    })

    it('reads from Desktop persistent settings first', async () => {
      mockGetSetting.mockResolvedValue('desktop-persisted-abc123')
      const { initDeviceId } = await loadModule()
      const id = await initDeviceId()

      expect(id).toBe('desktop-persisted-abc123')
      expect(mockGetSetting).toHaveBeenCalledWith('deviceId', null)
      // Should sync to localStorage too
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'jait-device-id-desktop',
        'desktop-persisted-abc123',
      )
    })

    it('migrates localStorage value to Desktop settings on upgrade', async () => {
      mockGetSetting.mockResolvedValue(null) // nothing in settings yet
      localStorageMap.set('jait-device-id-desktop', 'desktop-old-localStorage')

      const { initDeviceId } = await loadModule()
      const id = await initDeviceId()

      expect(id).toBe('desktop-old-localStorage')
      // Should have persisted the migrated value
      expect(mockSetSetting).toHaveBeenCalledWith('deviceId', 'desktop-old-localStorage')
    })

    it('generates new ID when neither settings nor localStorage exist', async () => {
      mockGetSetting.mockResolvedValue(null)
      const { initDeviceId } = await loadModule()
      const id = await initDeviceId()

      expect(id).toMatch(/^desktop-/)
      expect(mockSetSetting).toHaveBeenCalledWith('deviceId', id)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('jait-device-id-desktop', id)
    })

    it('does not call setSetting when ID already exists in settings', async () => {
      mockGetSetting.mockResolvedValue('desktop-existing-id')
      const { initDeviceId } = await loadModule()
      await initDeviceId()
      expect(mockSetSetting).not.toHaveBeenCalled()
    })

    it('persisted ID survives after init even if localStorage is cleared', async () => {
      mockGetSetting.mockResolvedValue('desktop-persistent-id')
      const { initDeviceId, generateDeviceId } = await loadModule()
      await initDeviceId()

      // Simulate localStorage being cleared (e.g., origin change)
      localStorageMap.clear()
      const syncId = generateDeviceId()
      expect(syncId).toBe('desktop-persistent-id')
    })

    it('returns the persisted Desktop ID even when localStorage sync throws', async () => {
      mockGetSetting.mockResolvedValue('desktop-persisted-abc123')
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('storage blocked')
      })

      const { initDeviceId } = await loadModule()
      const id = await initDeviceId()

      expect(id).toBe('desktop-persisted-abc123')
      expect(mockSetSetting).not.toHaveBeenCalled()
    })
  })
})

describe('device ID format', () => {
  it('generates unique IDs across calls (different module instances)', async () => {
    const mod1 = await loadModule()
    const id1 = mod1.generateDeviceId()

    vi.resetModules()
    localStorageMap.clear()

    const mod2 = await loadModule()
    const id2 = mod2.generateDeviceId()

    expect(id1).not.toBe(id2)
  })

  it('uses separate localStorage keys per platform', async () => {
    // Generate a web ID
    const webMod = await loadModule()
    webMod.generateDeviceId()
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'jait-device-id-web',
      expect.any(String),
    )

    vi.resetModules()
    windowMock.jaitDesktop = {}
    const desktopMod = await loadModule()
    desktopMod.generateDeviceId()
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'jait-device-id-desktop',
      expect.any(String),
    )
  })
})
