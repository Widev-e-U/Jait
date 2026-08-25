import { useCallback, useEffect, useRef } from 'react'
import { generateDeviceId } from '@/lib/device-id'
import type { ProjectRecord } from './useProjects'

/**
 * Turns the desktop's "Open with Jait" folder handoff into a selected project.
 *
 * The Electron side has always delivered the folder — synchronously on the
 * bridge when the click launched the app, and over `onOpenFolder` when a
 * second instance handed it to an already-running window — but nothing in the
 * renderer consumed either, so clicking the context-menu entry just opened the
 * app on whatever was last selected.
 */

type OpenProjectForRootPath = (
  rootPath: string,
  options?: { title?: string; nodeId?: string | null },
) => Promise<ProjectRecord | null>

/**
 * The project title for a folder is its own name, not the whole path.
 *
 * Splits on both separators rather than using the platform's: the renderer
 * runs on the gateway's OS, which is not necessarily the OS the path came
 * from (a Windows desktop can be driven by a Linux gateway).
 */
export function folderTitleFromPath(rootPath: string): string {
  const trimmed = rootPath.trim()
  if (!trimmed) return ''
  // A filesystem root ("/", "C:\") has no name of its own, so it keeps the
  // path as its title instead of collapsing to an empty string.
  const withoutTrailing = trimmed.replace(/[\\/]+$/, '')
  if (!withoutTrailing) return trimmed
  const segments = withoutTrailing.split(/[\\/]/)
  return segments[segments.length - 1] || withoutTrailing
}

export function useDesktopOpenFolder(
  enabled: boolean,
  openProjectForRootPath: OpenProjectForRootPath,
): void {
  const openRef = useRef(openProjectForRootPath)
  openRef.current = openProjectForRootPath
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  // Folders wait here until the app can actually talk to the gateway. A
  // handoff can land before sign-in (launching straight into the login
  // screen), and dropping it would make that click do nothing at all.
  const pendingRef = useRef<string[]>([])
  const drainingRef = useRef(false)
  const launchHandledRef = useRef(false)

  const drain = useCallback(async () => {
    if (drainingRef.current || !enabledRef.current) return
    drainingRef.current = true
    try {
      // One at a time, deliberately: two quick clicks on the same folder run
      // as two get-or-create calls, and in parallel both would look up the
      // root before either had created it and end up with duplicate projects
      // on one directory.
      while (enabledRef.current && pendingRef.current.length > 0) {
        const next = pendingRef.current.shift()
        if (!next) continue
        try {
          await openRef.current(next, {
            title: folderTitleFromPath(next),
            nodeId: generateDeviceId(),
          })
        } catch (err) {
          console.error('Failed to open folder as project:', err)
        }
      }
    } finally {
      drainingRef.current = false
    }
  }, [])

  // Launched by the context menu: the path is on the bridge at page load.
  useEffect(() => {
    if (launchHandledRef.current) return
    const desktop = typeof window !== 'undefined' ? window.jaitDesktop : undefined
    if (!desktop) return
    launchHandledRef.current = true
    const launchPath = desktop.openFolder
    if (typeof launchPath === 'string' && launchPath.trim()) {
      pendingRef.current.push(launchPath)
      void drain()
    }
  }, [drain])

  // Clicked while Jait was already open: the second instance forwards it here.
  useEffect(() => {
    const desktop = typeof window !== 'undefined' ? window.jaitDesktop : undefined
    if (!desktop?.onOpenFolder) return
    const cleanup = desktop.onOpenFolder((_event, folderPath) => {
      if (typeof folderPath !== 'string' || !folderPath.trim()) return
      pendingRef.current.push(folderPath)
      void drain()
    })
    return () => { if (typeof cleanup === 'function') cleanup() }
  }, [drain])

  // Signing in releases whatever queued up while signed out.
  useEffect(() => {
    if (enabled) void drain()
  }, [enabled, drain])
}
