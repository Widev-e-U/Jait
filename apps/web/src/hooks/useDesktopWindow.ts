import { useEffect, useState } from 'react'

/**
 * Detects the desktop shell platform and tracks window maximize/unmaximize
 * state for the custom titlebar. Extracted from the `App` god component.
 * No-ops in the browser (`window.jaitDesktop` absent), leaving
 * `desktopPlatform` null.
 *
 * `desktopRuntime` distinguishes the two shells: both expose
 * `window.jaitDesktop`, but the Tauri shell has no native
 * `titleBarOverlay`/traffic lights (the window is always frameless), so the
 * web app must render custom window controls there.
 */
export function useDesktopWindow() {
  const [desktopPlatform, setDesktopPlatform] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [desktopRuntime, setDesktopRuntime] = useState<'electron' | 'tauri' | null>(null)

  useEffect(() => {
    const desktop = (window as any).jaitDesktop
    if (!desktop) return
    setDesktopRuntime((window as any).__TAURI_INTERNALS__ ? 'tauri' : 'electron')
    desktop.getInfo?.().then((info: any) => setDesktopPlatform(info.platform))
    desktop.windowIsMaximized?.().then((max: boolean) => setIsMaximized(max))
    const cleanup = desktop.onMaximizedChange?.((_: unknown, maximized: boolean) => setIsMaximized(maximized))
    return () => { cleanup?.() }
  }, [])

  return { desktopPlatform, isMaximized, desktopRuntime }
}
