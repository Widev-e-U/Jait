/**
 * Centralised gateway URL resolution.
 *
 * Priority (highest → lowest):
 *   1. User override stored in localStorage (`jait-gateway-url`)
 *   2. Electron bridge value (`window.jaitDesktop?.getInfo()?.gatewayUrl`)
 *   3. Build-time env var (`VITE_API_URL`)
 *   4. Fallback: `window.location.origin` (same-origin) or `http://localhost:8000`
 *
 * All modules should import `getApiUrl()` / `getWsUrl()` from here instead
 * of reading `import.meta.env.VITE_API_URL` directly.
 */

const STORAGE_KEY = 'jait-gateway-url'

/**
 * When the web UI is served by the gateway itself (same origin),
 * use the page origin so it works behind reverse proxies / HTTPS.
 * Falls back to localhost:8000 for standalone dev or SSR.
 */
function getDefaultHttp(): string {
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return window.location.origin
  }
  return 'http://localhost:8000'
}

// ── Helpers ──────────────────────────────────────────────────────────

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function httpToWs(httpUrl: string): string {
  return httpUrl.replace(/^http/, 'ws')
}

// ── Read / write user override ───────────────────────────────────────

export function getStoredGatewayUrl(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function setStoredGatewayUrl(url: string | null): void {
  try {
    if (url && url.trim()) {
      localStorage.setItem(STORAGE_KEY, stripTrailingSlash(url.trim()))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // localStorage unavailable (e.g. sandboxed iframe)
  }
  // Notify other tabs / listeners
  window.dispatchEvent(new Event('jait-gateway-url-changed'))
}

// ── Resolved getters ─────────────────────────────────────────────────

/**
 * HTTP(S) gateway URL used by `fetch()` calls.
 */
export function getApiUrl(): string {
  const stored = getStoredGatewayUrl()
  if (stored) return stripTrailingSlash(stored)

  // Electron desktop bridge
  const desktop = (window as any).jaitDesktop?.getInfo?.()?.gatewayUrl as string | undefined
  if (desktop) return stripTrailingSlash(desktop)

  // Build-time env (Vite)
  const env = import.meta.env.VITE_API_URL as string | undefined
  if (env) return stripTrailingSlash(env)

  return getDefaultHttp()
}

/**
 * WebSocket gateway URL.
 */
export function getWsUrl(): string {
  const stored = getStoredGatewayUrl()
  if (stored) return stripTrailingSlash(httpToWs(stored))

  const env = import.meta.env.VITE_WS_URL as string | undefined
  if (env) return stripTrailingSlash(env)

  const apiUrl = getApiUrl()
  return stripTrailingSlash(httpToWs(apiUrl))
}

// ── Convenience constants (snapshot at import time — prefer getters) ─
export const API_URL = getApiUrl()
export const WS_URL = getWsUrl()
