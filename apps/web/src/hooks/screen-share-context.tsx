'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ScreenShareHandle } from './useScreenShare'

/**
 * Shares the app-level screen-share hook with panels (chat, browser, etc).
 *
 * A browser must have exactly one screen-share hook instance: it owns the
 * device identity and the signaling WebSocket. A second instance would
 * register a different device id for the same browser and open a competing
 * socket, so panels read this context instead of calling the hook.
 */
const ScreenShareContext = createContext<ScreenShareHandle | null>(null)

export function ScreenShareProvider({
  value,
  children,
}: {
  value: ScreenShareHandle
  children: ReactNode
}) {
  return <ScreenShareContext.Provider value={value}>{children}</ScreenShareContext.Provider>
}

/** The app-level handle, or null when rendered outside the provider. */
export function useScreenShareContext(): ScreenShareHandle | null {
  return useContext(ScreenShareContext)
}
