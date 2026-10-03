/**
 * Thin fetch wrapper that applies auth credentials automatically.
 *
 * - **Web (same-origin production)**: The HTTP-only `jait_token` cookie is sent
 *   automatically by the browser — no extra headers needed.
 * - **Web (cross-origin dev, Vite :3000 → gateway :8000)**: Adds
 *   `credentials: "include"` so the cookie travels across origins.
 * - **Desktop / Capacitor**: Sends `Authorization: Bearer <token>` header
 *   because cross-origin WebViews cannot rely on cookies.
 */

import { Capacitor } from '@capacitor/core'
import { getApiUrl } from './gateway-url'
import { getAuthToken } from './auth-token'

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  // Capacitor.isNativePlatform(), not truthiness of window.Capacitor: @capacitor/core
  // attaches that global as a module-load side effect even in plain browsers.
  return !!(window as any).jaitDesktop || Capacitor.isNativePlatform()
}

function isCrossOriginDev(): boolean {
  if (typeof window === 'undefined') return false
  return import.meta.env.DEV && window.location.port !== '8000'
}

/**
 * Drop-in replacement for `fetch()` that adds the right auth credentials.
 *
 * On native apps (Desktop/Capacitor) it injects the Bearer token header.
 * On the web it relies on cookies and adds `credentials: "include"` when
 * running in cross-origin dev mode.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const merged: RequestInit = { ...init, headers }

  if (isNativeApp()) {
    // Native apps use Bearer token — cookies don't work across WebView origins
    const token = getAuthToken()
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  } else if (isCrossOriginDev()) {
    // Cross-origin dev: browser needs credentials: include to send the cookie
    merged.credentials = 'include'
  }

  return fetch(input, merged)
}


let installed = false
export function installGatewayFetchAuth(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    const gateway = new URL(getApiUrl() || window.location.origin, window.location.href)
    if (url.origin !== gateway.origin || !url.pathname.startsWith('/api/')) return original(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (isNativeApp() && !headers.has('authorization')) {
      const token = getAuthToken()
      if (token) headers.set('authorization', 'Bearer ' + token)
    }
    return original(input, { ...init, headers, credentials: init?.credentials ?? 'include' })
  }
}
