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

function isStandaloneClient(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as any).jaitDesktop || (window as any).Capacitor)
}

function supportsGatewayOverride(): boolean {
  return import.meta.env.DEV || isStandaloneClient()
}

/**
 * When the web UI is served by the gateway itself (same origin),
 * use the page origin so it works behind reverse proxies / HTTPS.
 * In Vite dev the proxy config in vite.config.ts forwards /api, /auth
 * and /health to the gateway, so we use the page origin (same-origin)
 * to avoid cross-origin cookie issues.
 * Falls back to localhost:8000 for SSR or unknown environments.
 */
function getDefaultHttp(): string {
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return window.location.origin
  }
  return 'http://localhost:8000'
}

/**
 * Direct gateway URL (used for WebSocket which can't go through the Vite proxy).
 */
function getDirectGatewayUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    if (import.meta.env.DEV && window.location.port && window.location.port !== '8000') {
      return `${window.location.protocol}//${window.location.hostname}:8000`
    }
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
  if (!supportsGatewayOverride()) return null
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function setStoredGatewayUrl(url: string | null): void {
  if (!supportsGatewayOverride()) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage unavailable (e.g. sandboxed iframe)
    }
    window.dispatchEvent(new Event('jait-gateway-url-changed'))
    return
  }
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
  // Build-time env (Vite)
  const env = import.meta.env.VITE_API_URL as string | undefined
  if (import.meta.env.DEV && env) return stripTrailingSlash(env)

  const stored = getStoredGatewayUrl()
  if (stored) return stripTrailingSlash(stored)

  // Electron desktop bridge — synchronous property set by preload
  const desktop = typeof window !== 'undefined' ? (window as any).jaitDesktop?.gatewayUrl as string | undefined : undefined
  if (desktop) return stripTrailingSlash(desktop)

  if (env) return stripTrailingSlash(env)

  return getDefaultHttp()
}

/**
 * WebSocket gateway URL.
 * WebSocket connects directly to the gateway (not through Vite proxy)
 * because the gateway WS is on the root path.
 */
export function getWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined
  if (import.meta.env.DEV && env) return stripTrailingSlash(env)

  const stored = getStoredGatewayUrl()
  if (stored) return stripTrailingSlash(httpToWs(stored))

  // Electron desktop bridge
  const desktop = typeof window !== 'undefined' ? (window as any).jaitDesktop?.gatewayUrl as string | undefined : undefined
  if (desktop) return stripTrailingSlash(httpToWs(desktop))

  const env2 = import.meta.env.VITE_API_URL as string | undefined
  if (env2) return stripTrailingSlash(httpToWs(env2))

  // Use direct gateway URL (not proxied) for WebSocket
  return stripTrailingSlash(httpToWs(getDirectGatewayUrl()))
}

// ── State helpers ────────────────────────────────────────────────────

/**
 * Returns true when the gateway URL has been explicitly configured
 * (via localStorage, Electron bridge, or build-time env).
 * When false, the URL is just a fallback guess (e.g. window.location.origin)
 * and API calls should be deferred until the user sets a URL.
 */
export function isGatewayConfigured(): boolean {
  if (supportsGatewayOverride() && getStoredGatewayUrl()) return true
  if (typeof window !== 'undefined' && (window as any).jaitDesktop?.gatewayUrl) return true
  if (import.meta.env.VITE_API_URL) return true
  if (!supportsGatewayOverride()) return true
  return false
}

// ── Convenience constants (snapshot at import time — prefer getters) ─
export const API_URL = getApiUrl()
export const WS_URL = getWsUrl()
