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

function readStoredDeviceId(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

function persistDeviceId(storageKey: string, deviceId: string): void {
  try {
    localStorage.setItem(storageKey, deviceId)
  } catch {
    // Storage can be unavailable in sandboxed browsers or privacy-constrained contexts.
  }
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
    // The main process resolves the persistent ID synchronously and exposes it
    // via the preload bridge. Prefer it so init never disagrees with the sync
    // generateDeviceId() getter (which already used the same value).
    const bridgeId = desktop.deviceId as string | undefined
    if (bridgeId) {
      _cachedDeviceId = bridgeId
      persistDeviceId(storageKey, bridgeId)
      // Ensure the persistent settings file agrees (idempotent).
      try { await desktop.setSetting(settingsKey, bridgeId) } catch { /* ignore */ }
      return bridgeId
    }
    // Try persistent Electron settings first
    const persisted = await desktop.getSetting(settingsKey, null) as string | null
    if (persisted) {
      _cachedDeviceId = persisted
      // Keep localStorage in sync for immediate reads
      persistDeviceId(storageKey, persisted)
      return persisted
    }
    // Migrate from localStorage if present (upgrade path)
    const fromStorage = readStoredDeviceId(storageKey)
    if (fromStorage) {
      _cachedDeviceId = fromStorage
      await desktop.setSetting(settingsKey, fromStorage)
      return fromStorage
    }
    // Generate new
    const id = makeDeviceId(platform)
    _cachedDeviceId = id
    persistDeviceId(storageKey, id)
    await desktop.setSetting(settingsKey, id)
    return id
  }

  // Non-Electron: localStorage only
  const stored = readStoredDeviceId(storageKey)
  if (stored) {
    _cachedDeviceId = stored
    return stored
  }
  const id = makeDeviceId(platform)
  _cachedDeviceId = id
  persistDeviceId(storageKey, id)
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

  // Electron: the main process resolves the persistent device ID from
  // desktop-settings.json at startup and exposes it synchronously via the
  // preload bridge. Use it first so that code running before initDeviceId()
  // completes (e.g. project creation on first render) stamps the *real*
  // nodeId onto projects instead of a throwaway random one.
  if (platform === 'electron') {
    const bridgeId = typeof window !== 'undefined' ? (window as any).jaitDesktop?.deviceId as string | undefined : undefined
    if (bridgeId) {
      _cachedDeviceId = bridgeId
      persistDeviceId(storageKey, bridgeId)
      return bridgeId
    }
  }

  const stored = readStoredDeviceId(storageKey)
  if (stored) {
    _cachedDeviceId = stored
    return stored
  }
  // Fallback: generate and store (should only happen if initDeviceId wasn't called)
  const id = makeDeviceId(platform)
  _cachedDeviceId = id
  persistDeviceId(storageKey, id)
  return id
}
