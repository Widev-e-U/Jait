import { useEffect, useState } from 'react'

/**
 * Detects the Electron platform and tracks window maximize/unmaximize state for
 * the custom titlebar. Extracted from the `App` god component. No-ops outside
 * Electron (`window.jaitDesktop` absent), leaving `desktopPlatform` null.
 */
export function useDesktopWindow() {
  const [desktopPlatform, setDesktopPlatform] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const desktop = (window as any).jaitDesktop
    if (!desktop) return
    desktop.getInfo?.().then((info: any) => setDesktopPlatform(info.platform))
    desktop.windowIsMaximized?.().then((max: boolean) => setIsMaximized(max))
    const cleanup = desktop.onMaximizedChange?.((_: unknown, maximized: boolean) => setIsMaximized(maximized))
    return () => { cleanup?.() }
  }, [])

  return { desktopPlatform, isMaximized }
}
