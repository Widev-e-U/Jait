/// <reference types="vite/client" />

// ── Electron desktop bridge (available when running inside Electron) ──

interface DesktopSource {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
}

interface JaitDesktopBridge {
  getInfo: () => Promise<{
    platform: 'win32' | 'darwin' | 'linux'
    arch: string
    electronVersion: string
    gatewayUrl: string
    isPackaged: boolean
  }>
  getDesktopSources: () => Promise<DesktopSource[]>
  notify: (opts: { title: string; body: string }) => Promise<{ ok: true }>
  confirmShare: (opts: { title: string; message: string }) => Promise<{ accepted: boolean }>
  pickDirectory: () => Promise<{ path: string } | null>
  /** Browse a local directory (for remote fs node protocol) */
  browsePath: (dirPath: string) => Promise<{
    path: string
    parent: string | null
    entries: { name: string; path: string; type: 'dir' | 'file' }[]
  }>
  /** Get root drives / home directory */
  getRoots: () => Promise<{
    roots: { name: string; path: string; type: 'dir' | 'file' }[]
  }>
  onScreenShareStart: (callback: () => void) => void
  onScreenShareStop: (callback: () => void) => void
  platform: 'electron'
}

interface Window {
  jaitDesktop?: JaitDesktopBridge
}
