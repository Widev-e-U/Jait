import { useEffect, useState } from 'react'

/**
 * Detects the desktop shell platform and tracks window maximize/unmaximize
 * state for the custom titlebar. Extracted from the `App` god component.
 * No-ops in the browser (`window.jaitDesktop` absent), leaving
 * `desktopPlatform` null.
 *
 * `desktopRuntime` lets the web UI enable shell-specific drag regions and
 * custom controls. Tauri is frameless outside Linux; Linux keeps native
 * window-manager decorations.
 */
export function useDesktopWindow() {
  const [desktopPlatform, setDesktopPlatform] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [desktopRuntime, setDesktopRuntime] = useState<'tauri' | null>(null)

  useEffect(() => {
    const desktop = (window as any).jaitDesktop
    if (!desktop) return
    setDesktopRuntime('tauri')
    desktop.getInfo?.().then((info: any) => setDesktopPlatform(info.platform))
    desktop.windowIsMaximized?.().then((max: boolean) => setIsMaximized(max))
    const cleanup = desktop.onMaximizedChange?.((_: unknown, maximized: boolean) => setIsMaximized(maximized))
    return () => { cleanup?.() }
  }, [])

  return { desktopPlatform, isMaximized, desktopRuntime }
}
