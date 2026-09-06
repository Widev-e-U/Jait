// ────────────────────────────────────────────────────────────────────────────
// Version watchdog
//
// The SPA is served from a content-hashed bundle. A long-lived tab keeps the
// JS it loaded at mount time in memory, so after a new deploy the tab keeps
// running the OLD bundle (and, before a deploy, could keep surfacing stale
// runtime errors such as React #185 "Maximum update depth exceeded").
//
// The gateway serves `index.html` with `Cache-Control: public, max-age=0`
// plus an `ETag` / `Last-Modified` that change on every rebuild. We poll it
// (bypassing the browser cache) and reload the page when the build stamp
// changes, so users never have to manually hard-refresh to pick up a deploy.
// ────────────────────────────────────────────────────────────────────────────

let baseline: string | null = null
let reloadTriggered = false

async function currentBuildStamp(): Promise<string | null> {
  const res = await fetch(new URL('/', window.location.origin).href, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  })
  if (!res.ok) return null
  return (
    res.headers.get('etag') ??
    res.headers.get('last-modified') ??
    res.headers.get('digest')
  )
}

async function checkForNewBuild(): Promise<void> {
  if (reloadTriggered) return
  let stamp: string | null
  try {
    stamp = await currentBuildStamp()
  } catch {
    // Offline / transient network error — retry on the next tick.
    return
  }
  if (stamp == null) return

  if (baseline == null) {
    // First successful read is the build we are currently running.
    baseline = stamp
    return
  }

  if (stamp !== baseline) {
    reloadTriggered = true
    console.info('[jait] New web build detected — reloading to apply update.')
    window.location.reload()
  }
}

/**
 * Start polling for a new deploy. On change the page reloads itself, so stale
 * bundles (and any stale runtime behaviour they carry) are never served twice.
 */
export function installVersionWatchdog(
  intervalMs = 60_000,
  opts?: { dev?: boolean },
): void {
  if (typeof window === 'undefined' || window.location.reload === undefined) return

  // In Vite dev HMR already applies code changes, and a full reload would
  // interrupt the developer mid-interaction; skip there. (`dev` is injectable
  // because vitest statically replaces import.meta.env.DEV.)
  if (opts?.dev ?? import.meta.env.DEV) return

  // Pages served through the gateway's preview proxies (project previews) are
  // ephemeral. They must not reload just because the *gateway's* own build
  // stamp changed — that is what produced perceived reload loops while the
  // gateway (or its web dist) was being rebuilt during active sessions.
  const { pathname } = window.location
  if (pathname.startsWith('/api/dev-proxy/') || pathname.startsWith('/api/dev-file/')) return

  void checkForNewBuild()
  window.setInterval(() => void checkForNewBuild(), intervalMs)

  // Check immediately when the tab is focused again too, so a tab that sat
  // in the background picks up a deploy the moment the user returns to it.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForNewBuild()
  })
  window.addEventListener('focus', () => void checkForNewBuild())
}
