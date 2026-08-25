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

import { Capacitor } from '@capacitor/core'

const STORAGE_KEY = 'jait-gateway-url'

function isStandaloneClient(): boolean {
  if (typeof window === 'undefined') return false
  // Capacitor.isNativePlatform(), not truthiness of window.Capacitor: @capacitor/core
  // attaches that global as a module-load side effect even in plain browsers.
  return Boolean((window as any).jaitDesktop) || Capacitor.isNativePlatform()
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

export function normalizeDirectGatewayBase(url: string, isDev = import.meta.env.DEV): string {
  try {
    const parsed = new URL(url)
    if (isDev && parsed.port && parsed.port !== '8000') {
      parsed.port = '8000'
    }
    return stripTrailingSlash(parsed.toString())
  } catch {
    return stripTrailingSlash(url)
  }
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
 * In Vite dev the WS path `/ws` is proxied to the gateway (see vite.config.ts),
 * while the page origin's root path is not. So when the resolved WS URL points
 * at the same server serving the page (same port), route through the `/ws`
 * proxy instead of connecting to the root path directly. This keeps the
 * control-plane WebSocket in line with how the voice assistant already routes.
 */
function routeViaWsProxy(wsUrl: string, pageUrl: string): string {
  if (!import.meta.env.DEV) return wsUrl
  try {
    const ws = new URL(wsUrl)
    const page = new URL(pageUrl)
    if (ws.port && page.port && ws.port === page.port) {
      return `${stripTrailingSlash(wsUrl)}/ws`
    }
  } catch {
    // fall through
  }
  return wsUrl
}

/**
 * WebSocket gateway URL.
 * In dev the WebSocket goes through the Vite `/ws` proxy so it reaches the
 * gateway on the same origin (no cross-origin cookie issues). Outside dev
 * (Electron / production served by the gateway) it connects to the gateway
 * root path directly.
 */
export function getWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined
  if (import.meta.env.DEV && env) return stripTrailingSlash(env)

  const stored = getStoredGatewayUrl()
  const desktop = typeof window !== 'undefined' ? (window as any).jaitDesktop?.gatewayUrl as string | undefined : undefined
  const apiEnv = import.meta.env.VITE_API_URL as string | undefined

  let ws: string
  if (env) ws = env
  else if (stored) ws = httpToWs(stored)
  else if (desktop) ws = httpToWs(desktop)
  else if (apiEnv) ws = httpToWs(normalizeDirectGatewayBase(apiEnv))
  else ws = httpToWs(getDirectGatewayUrl())

  ws = stripTrailingSlash(ws)

  if (typeof window !== 'undefined' && window.location?.origin) {
    ws = routeViaWsProxy(ws, window.location.origin)
  }

  return ws
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
