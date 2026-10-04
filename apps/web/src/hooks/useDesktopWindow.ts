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
    const desktop = window.jaitDesktop
    if (!desktop) return
    let disposed = false
    let cleanup: (() => void) | undefined
    setDesktopRuntime('tauri')
    desktop.getInfo?.().then((info) => {
      if (!disposed) setDesktopPlatform(info.platform)
    })
    desktop.windowIsMaximized?.().then((max) => {
      if (!disposed) setIsMaximized(max)
    })
    const subscription = desktop.onMaximizedChange?.((_, maximized) => {
      if (!disposed) setIsMaximized(maximized)
    })
    // Installed Tauri shims return a Promise; older bridges return the
    // unsubscribe function directly. Dispose even if it resolves after unmount.
    if (typeof subscription === 'function') {
      cleanup = subscription
    } else {
      void Promise.resolve(subscription).then((stop) => {
        if (disposed) stop?.()
        else cleanup = stop
      }).catch((error) => console.warn('Desktop window listener failed', error))
    }
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])

  return { desktopPlatform, isMaximized, desktopRuntime }
}
