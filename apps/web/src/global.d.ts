interface JaitDesktop {
  gatewayUrl?: string
  /**
   * Folder passed on the command line — the "Open with Jait" context-menu
   * entry. Present only when this instance was launched with one.
   */
  openFolder?: string
  /** Stable device ID resolved by the main process from desktop-settings.json. */
  deviceId?: string
  /**
   * "Open with Jait" fired while the app was already running: the second
   * instance hands its folder to this one instead of launching. Optional
   * because a packaged desktop older than this bridge will not expose it.
   */
  onOpenFolder?: (callback: (event: unknown, folderPath: string) => void) => () => void
  getInfo: () => Promise<{ platform: string; arch: string; appVersion?: string; gatewayUrl?: string }>
  getDesktopSources: () => Promise<Array<{ id: string; name: string; thumbnail: string; appIcon: string | null }>>
  notify: (opts: { id?: string; title: string; body: string }) => Promise<void>
  /** Dismiss a keyed notification — used when another device answers first. */
  closeNotification?: (id: string) => Promise<{ ok: boolean }>
  confirmShare: (opts: { title: string; message: string }) => Promise<{ accepted: boolean }>
  pickDirectory: () => Promise<{ path: string } | null>
  browsePath: (dirPath: string) => Promise<{
    path: string
    parent: string | null
    entries: { name: string; path: string; type: 'dir' | 'file' }[]
  }>
  getRoots: () => Promise<{ roots: { name: string; path: string; type: 'dir' | 'file' }[] }>
  fsOp: (op: string, params: Record<string, unknown>) => Promise<unknown>
  detectProviders: () => Promise<Array<string | { id: string; providerType?: string; name?: string; installed: boolean; authenticated: boolean | null; detail?: string }>>
  providerOp: (op: string, params: Record<string, unknown>) => Promise<unknown>
  toolOp: (tool: string, args: Record<string, unknown>, meta: Record<string, unknown>) => Promise<unknown>
  terminalOp: (op: string, params: Record<string, unknown>) => Promise<unknown>
  openProjectWindow: (opts: { url: string; title?: string }) => Promise<{ ok: boolean }>
  onScreenShareStart: (callback: () => void) => void
  onScreenShareStop: (callback: () => void) => void
  onGatewayEvent: (callback: (event: unknown, data: unknown) => void) => void
  removeGatewayEventListener: () => void
  getPathForFile: (file: File) => string
  platform: 'electron'
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onMaximizedChange: (callback: (event: unknown, maximized: boolean) => void) => () => void
  setTitleBarOverlay: (opts: { color?: string; symbolColor?: string; height?: number }) => Promise<void>
  getSetting: (key: string, defaultValue?: unknown) => Promise<unknown>
  setSetting: (key: string, value: unknown) => Promise<{ ok: boolean }>
  readClipboardText: () => Promise<string>
  getLoginItem: () => Promise<{ enabled: boolean; supported: boolean }>
  setLoginItem: (enabled: boolean) => Promise<{ ok: boolean; enabled: boolean; error?: string }>

  // Auto-update
  checkForUpdate: () => Promise<{ updateAvailable: boolean; version?: string; error?: string }>
  downloadUpdate: () => Promise<{ ok: boolean }>
  installUpdate: () => Promise<void>
  onUpdateEvent: (
    event: 'checking' | 'available' | 'not-available' | 'download-progress' | 'downloaded' | 'error',
    callback: (event: unknown, data: unknown) => void,
  ) => () => void
}

declare global {
  interface Window {
    jaitDesktop?: JaitDesktop
    Capacitor?: unknown
    __JAIT_DESKTOP_BOOT__?: {
      gatewayUrl?: string
      gatewayConfigured?: boolean
      deviceID?: string
      platform?: string
    }
  }
}

export {}
