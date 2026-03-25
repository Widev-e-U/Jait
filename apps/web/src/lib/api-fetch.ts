/**
 * Thin fetch wrapper that applies auth credentials automatically.
 *
 * - **Web (same-origin production)**: The HTTP-only `jait_token` cookie is sent
 *   automatically by the browser — no extra headers needed.
 * - **Web (cross-origin dev, Vite :3000 → gateway :8000)**: Adds
 *   `credentials: "include"` so the cookie travels across origins.
 * - **Electron / Capacitor**: Sends `Authorization: Bearer <token>` header
 *   because cross-origin WebViews cannot rely on cookies.
 */

import { getAuthToken } from './auth-token'

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).jaitDesktop || !!(window as any).Capacitor
}

function isCrossOriginDev(): boolean {
  if (typeof window === 'undefined') return false
  return import.meta.env.DEV && window.location.port !== '8000'
}

/**
 * Drop-in replacement for `fetch()` that adds the right auth credentials.
 *
 * On native apps (Electron/Capacitor) it injects the Bearer token header.
 * On the web it relies on cookies and adds `credentials: "include"` when
 * running in cross-origin dev mode.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
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
