/**
 * Device identification utilities.
 *
 * Generates a persistent device ID per platform (web, capacitor, electron)
 * stored in localStorage. Used to track which device registered a repository.
 */

export function detectPlatform(): 'electron' | 'capacitor' | 'web' {
  if (typeof window !== 'undefined' && (window as any).jaitDesktop) return 'electron'
  if (typeof window !== 'undefined' && 'Capacitor' in window) return 'capacitor'
  return 'web'
}

export function generateDeviceId(): string {
  const platform = detectPlatform()
  const storageKey = `jait-device-id-${platform}`
  const stored = localStorage.getItem(storageKey)
  if (stored) return stored
  const id = `${platform}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  localStorage.setItem(storageKey, id)
  return id
}
