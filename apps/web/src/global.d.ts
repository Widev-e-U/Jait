interface JaitDesktop {
  gatewayUrl?: string
  getInfo: () => Promise<{ platform: string; arch: string; appVersion?: string; gatewayUrl?: string }>
  getDesktopSources: () => Promise<Array<{ id: string; name: string; thumbnail: string; appIcon: string | null }>>
  notify: (opts: { title: string; body: string }) => Promise<void>
  confirmShare: (opts: { title: string; message: string }) => Promise<{ accepted: boolean }>
  pickDirectory: () => Promise<{ path: string } | null>
  browsePath: (dirPath: string) => Promise<{
    path: string
    parent: string | null
    entries: { name: string; path: string; type: 'dir' | 'file' }[]
  }>
  getRoots: () => Promise<{ roots: { name: string; path: string; type: 'dir' | 'file' }[] }>
  fsOp: (op: string, params: Record<string, unknown>) => Promise<unknown>
  detectProviders: () => Promise<string[]>
  providerOp: (op: string, params: Record<string, unknown>) => Promise<unknown>
  toolOp: (tool: string, args: Record<string, unknown>, meta: Record<string, unknown>) => Promise<unknown>
  openWorkspaceWindow: (opts: { url: string; title?: string }) => Promise<{ ok: boolean }>
  onScreenShareStart: (callback: () => void) => void
  onScreenShareStop: (callback: () => void) => void
  onGatewayEvent: (callback: (event: unknown, data: unknown) => void) => void
  removeGatewayEventListener: () => void
  platform: 'electron'
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onMaximizedChange: (callback: (event: unknown, maximized: boolean) => void) => () => void
  setTitleBarOverlay: (opts: { color?: string; symbolColor?: string; height?: number }) => Promise<void>
  getSetting: (key: string, defaultValue?: unknown) => Promise<unknown>
  setSetting: (key: string, value: unknown) => Promise<{ ok: boolean }>

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
  }
}

export {}
