import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { type UpdateInfo } from '@/components/settings/SettingsPage'
import { getNonEmptyMessage } from '@/lib/values'

export type { UpdateInfo }

export interface UseUpdateCheckerOptions {
  token: string | null
  isElectron: boolean
  appPlatform: 'web' | 'electron' | 'capacitor'
  apiUrl: string
}

/**
 * Owns the self-update flow: checking for an available update, applying it, and
 * detecting the gateway restart that follows (via WebSocket connection events).
 * Extracted from the `App` god component. The connection-driven restart
 * detection is exposed as `handleConnectionRestart` so `App`'s shared
 * connection handler can delegate to it.
 */
export function useUpdateChecker({ token, isElectron, appPlatform, apiUrl }: UseUpdateCheckerOptions) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateApplying, setUpdateApplying] = useState(false)
  const [updateAwaitingRestart, setUpdateAwaitingRestart] = useState(false)
  const pendingGatewayRestartVersionRef = useRef<string | null>(null)
  const gatewayRestartSawDisconnectRef = useRef(false)

  const handleCheckUpdate = useCallback(async () => {
    if (!token) return
    setUpdateChecking(true)
    try {
      if (isElectron) {
        const desktop = (window as any).jaitDesktop
        const [info, result, healthRes] = await Promise.all([
          desktop.getInfo?.() as Promise<{ appVersion: string }>,
          desktop.checkForUpdate() as Promise<{ updateAvailable: boolean; version?: string }>,
          fetch(`${apiUrl}/health`).then(r => r.ok ? r.json() as Promise<{ version?: string }> : null).catch(() => null),
        ])
        const gatewayVersion = (healthRes as { version?: string } | null)?.version ?? ''
        const appVersion = info?.appVersion ?? ''
        const latestVersion = result.version ?? appVersion ?? ''
        // The desktop binary and the gateway are released together but update
        // independently: the gateway self-updates via npm, while the desktop
        // binary only updates through electron-updater (download + install).
        // Whether the *desktop binary* needs an update is decided solely by
        // electron-updater, which compares app.getVersion() (the binary's
        // stamped release version) against the published latest.yml. Do NOT
        // suppress the update based on the gateway version — once the gateway
        // self-updates via npm it jumps ahead of the binary, and comparing
        // against it would permanently hide the desktop's own update button.
        const hasUpdate = result.updateAvailable
        setUpdateInfo({
          currentVersion: gatewayVersion || appVersion,
          latestVersion,
          hasUpdate,
        })
      } else {
        const res = await fetch(`${apiUrl}/api/update/check`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          setUpdateInfo(await res.json() as UpdateInfo)
        }
      }
    } catch { /* ignore */ }
    setUpdateChecking(false)
  }, [token, isElectron, apiUrl])

  const handleApplyUpdate = useCallback(async () => {
    if (!token || !updateInfo?.hasUpdate) return
    setUpdateApplying(true)
    try {
      const res = await fetch(`${apiUrl}/api/update/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: updateInfo.latestVersion }),
      })
      if (res.ok) {
        pendingGatewayRestartVersionRef.current = updateInfo.latestVersion
        gatewayRestartSawDisconnectRef.current = false
        setUpdateAwaitingRestart(true)
        toast.success(`Updated to v${updateInfo.latestVersion}. Gateway is restarting...`)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(getNonEmptyMessage((data as any).error, 'Update failed'))
      }
    } catch { toast.error('Update request failed') }
    setUpdateApplying(false)
  }, [token, updateInfo, apiUrl])

  const hardReloadAfterUpdate = useCallback(() => {
    const reloadUrl = new URL(window.location.href)
    reloadUrl.searchParams.set('_jaitUpdate', Date.now().toString())

    void (async () => {
      try {
        if ('caches' in window) {
          const cacheKeys = await caches.keys()
          await Promise.all(cacheKeys.map((key) => caches.delete(key)))
        }
      } catch {
        // Ignore cache API failures and still reload.
      }
      window.location.replace(reloadUrl.toString())
    })()
  }, [])

  /**
   * Drives gateway-restart detection from WebSocket connection changes. Returns
   * nothing; callers should run their own connection-side effects (e.g. provider
   * refresh) separately.
   */
  const handleConnectionRestart = useCallback(({ connected, reconnected }: { connected: boolean; reconnected: boolean }) => {
    if (!connected) {
      if (pendingGatewayRestartVersionRef.current) {
        gatewayRestartSawDisconnectRef.current = true
      }
      return
    }

    if (reconnected && pendingGatewayRestartVersionRef.current && gatewayRestartSawDisconnectRef.current) {
      const version = pendingGatewayRestartVersionRef.current
      pendingGatewayRestartVersionRef.current = null
      gatewayRestartSawDisconnectRef.current = false
      setUpdateAwaitingRestart(false)
      if (appPlatform === 'web') {
        toast.success(`Gateway restarted on v${version}. Refreshing...`)
        hardReloadAfterUpdate()
        return
      }
      toast.success(`Gateway restarted on v${version}.`)
      void handleCheckUpdate()
    }
  }, [appPlatform, handleCheckUpdate, hardReloadAfterUpdate])

  // Auto-check for updates on mount (once authenticated)
  useEffect(() => {
    if (token) void handleCheckUpdate()
  }, [token, handleCheckUpdate])

  return {
    updateInfo,
    updateChecking,
    updateApplying,
    updateAwaitingRestart,
    handleCheckUpdate,
    handleApplyUpdate,
    handleConnectionRestart,
  }
}
