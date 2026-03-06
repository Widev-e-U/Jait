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
  onScreenShareStart: (callback: () => void) => void
  onScreenShareStop: (callback: () => void) => void
  platform: 'electron'
}

interface Window {
  jaitDesktop?: JaitDesktopBridge
}
