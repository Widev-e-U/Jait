/**
 * Device identification utilities.
 *
 * Generates a persistent device ID per platform (web, capacitor, electron).
 * On Electron the ID is stored in desktop-settings.json (survives reinstalls).
 * On other platforms it falls back to localStorage.
 */

export function detectPlatform(): 'electron' | 'capacitor' | 'web' {
  if (typeof window !== 'undefined' && (window as any).jaitDesktop) return 'electron'
  if (typeof window !== 'undefined' && 'Capacitor' in window) return 'capacitor'
  return 'web'
}

// Module-level cache so the sync getter always returns immediately after init.
let _cachedDeviceId: string | null = null

function makeDeviceId(platform: string): string {
  return `${platform}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Initialise the device ID asynchronously.
 *
 * On Electron this reads from persistent desktop-settings.json (via IPC),
 * migrating any existing localStorage value on first run.
 * Must be called once at app startup before relying on `generateDeviceId()`.
 */
export async function initDeviceId(): Promise<string> {
  if (_cachedDeviceId) return _cachedDeviceId

  const platform = detectPlatform()
  const storageKey = `jait-device-id-${platform}`
  const settingsKey = 'deviceId'

  if (platform === 'electron' && (window as any).jaitDesktop?.getSetting) {
    const desktop = (window as any).jaitDesktop
    // Try persistent Electron settings first
    const persisted = await desktop.getSetting(settingsKey, null) as string | null
    if (persisted) {
      _cachedDeviceId = persisted
      // Keep localStorage in sync for immediate reads
      localStorage.setItem(storageKey, persisted)
      return persisted
    }
    // Migrate from localStorage if present (upgrade path)
    const fromStorage = localStorage.getItem(storageKey)
    if (fromStorage) {
      _cachedDeviceId = fromStorage
      await desktop.setSetting(settingsKey, fromStorage)
      return fromStorage
    }
    // Generate new
    const id = makeDeviceId(platform)
    _cachedDeviceId = id
    localStorage.setItem(storageKey, id)
    await desktop.setSetting(settingsKey, id)
    return id
  }

  // Non-Electron: localStorage only
  const stored = localStorage.getItem(storageKey)
  if (stored) {
    _cachedDeviceId = stored
    return stored
  }
  const id = makeDeviceId(platform)
  _cachedDeviceId = id
  localStorage.setItem(storageKey, id)
  return id
}

/**
 * Return the device ID synchronously.
 *
 * If `initDeviceId()` has been called, returns the cached value.
 * Otherwise falls back to localStorage (always works for web/capacitor,
 * works for Electron after first run since we sync to localStorage).
 */
export function generateDeviceId(): string {
  if (_cachedDeviceId) return _cachedDeviceId

  const platform = detectPlatform()
  const storageKey = `jait-device-id-${platform}`
  const stored = localStorage.getItem(storageKey)
  if (stored) {
    _cachedDeviceId = stored
    return stored
  }
  // Fallback: generate and store (should only happen if initDeviceId wasn't called)
  const id = makeDeviceId(platform)
  _cachedDeviceId = id
  localStorage.setItem(storageKey, id)
  return id
}
