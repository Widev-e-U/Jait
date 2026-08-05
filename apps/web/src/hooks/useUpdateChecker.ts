import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { type UpdateInfo, type ReleaseNote } from '@/components/settings/SettingsPage'
import { getNonEmptyMessage } from '@/lib/values'

export type { UpdateInfo, ReleaseNote }

export interface UseUpdateCheckerOptions {
  token: string | null
  isElectron: boolean
  appPlatform: 'web' | 'electron' | 'capacitor'
  apiUrl: string
}

const CHANGELOG_LIMIT = 15

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
  const [releases, setReleases] = useState<ReleaseNote[] | null>(null)
  const [releasesLoading, setReleasesLoading] = useState(false)
  const pendingGatewayRestartVersionRef = useRef<string | null>(null)
  const gatewayRestartSawDisconnectRef = useRef(false)

  /** Fetch patch notes for the most recent releases (a general changelog, so the
   *  Settings changelog page has content even when already up to date). */
  const loadChangelog = useCallback(async () => {
    if (!token) return
    setReleasesLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(CHANGELOG_LIMIT) })
      const res = await fetch(`${apiUrl}/api/update/changelog?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json() as { releases: ReleaseNote[] }
        setReleases(data.releases)
      }
    } catch {
      /* keep the previous releases */
    } finally {
      setReleasesLoading(false)
    }
  }, [token, apiUrl])

  const handleCheckChangelog = useCallback(() => {
    void loadChangelog()
  }, [loadChangelog])

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
        void loadChangelog()
      } else if (appPlatform === 'capacitor') {
        let currentVersion = ''
        try {
          const { App } = await import('@capacitor/app')
          const info = await App.getInfo()
          currentVersion = info.version ?? ''
        } catch {
          currentVersion = ''
        }

        const res = await fetch(
          `${apiUrl}/api/mobile-update/check?currentVersion=${encodeURIComponent(currentVersion)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.ok) {
          const data = await res.json() as UpdateInfo
          const resolvedCurrent = currentVersion || data.currentVersion
          setUpdateInfo({ ...data, currentVersion: resolvedCurrent })
          void loadChangelog()
        }
      } else {
        const res = await fetch(`${apiUrl}/api/update/check`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json() as UpdateInfo
          setUpdateInfo(data)
          void loadChangelog()
        }
      }
    } catch { /* ignore */ }
    setUpdateChecking(false)
  }, [token, isElectron, appPlatform, apiUrl, loadChangelog])

  const handleApplyUpdate = useCallback(async () => {
    if (!token || !updateInfo?.hasUpdate) return
    setUpdateApplying(true)
    try {
      if (appPlatform === 'capacitor') {
        const downloadUrl = updateInfo.downloadUrl
        const appUpdater = (window as any).Capacitor?.Plugins?.AppUpdater
        if (!downloadUrl) {
          toast.error('No APK found on the latest release')
          return
        }
        if (!appUpdater) {
          toast.error('Update plugin unavailable — update the app to get this feature')
          return
        }
        toast.info('Downloading update...')
        // wearUrl starts the paired-watch update in parallel. Current watch builds receive
        // the validated APK from the phone over ChannelClient; the legacy build gets the URL
        // once so it can bootstrap into direct-transfer support.
        const result = await appUpdater.downloadAndInstall({
          url: downloadUrl,
          wearUrl: updateInfo.wearDownloadUrl ?? undefined,
        })
        if (result?.ok) {
          toast.success('Installer launched — follow the prompt to finish updating.')
        } else {
          toast.error('Download failed')
        }
        return
      }

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update request failed')
    } finally {
      setUpdateApplying(false)
    }
  }, [token, updateInfo, appPlatform, apiUrl])

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

  // Main process pushes 'available'/'downloaded' events whenever its background
  // poll (on launch + every 4h, see electron-main.ts initAutoUpdater) finds a
  // new version — without this, the UI only ever reflected the one-shot mount
  // check above and stayed stale until the user restarted the app.
  const lastNotifiedVersionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isElectron) return
    const desktop = (window as any).jaitDesktop
    if (!desktop?.onUpdateEvent) return

    const applyPushedUpdate = (version: string | undefined, downloaded: boolean) => {
      setUpdateInfo((prev) => ({
        currentVersion: prev?.currentVersion ?? '',
        latestVersion: version ?? prev?.latestVersion ?? '',
        hasUpdate: true,
      }))
      if (version && lastNotifiedVersionRef.current !== version) {
        lastNotifiedVersionRef.current = version
        toast(downloaded ? `Update v${version} downloaded — restart to install.` : `Update v${version} is available.`)
      }
    }

    const offAvailable = desktop.onUpdateEvent('available', (_event: unknown, data: { version?: string }) => {
      applyPushedUpdate(data?.version, false)
    })
    const offDownloaded = desktop.onUpdateEvent('downloaded', (_event: unknown, data: { version?: string }) => {
      applyPushedUpdate(data?.version, true)
    })

    return () => {
      offAvailable?.()
      offDownloaded?.()
    }
  }, [isElectron])

  return {
    updateInfo,
    updateChecking,
    updateApplying,
    updateAwaitingRestart,
    releases,
    releasesLoading,
    handleCheckUpdate,
    handleCheckChangelog,
    handleApplyUpdate,
    handleConnectionRestart,
  }
}
