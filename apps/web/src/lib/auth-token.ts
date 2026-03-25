const TOKEN_KEY = 'jait-auth-token'
const LEGACY_TOKEN_KEY = 'token'
const CREDENTIAL_KEY = 'jait-auth-token'

let memoryToken: string | null = null

function readLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function getDesktopBridge(): any | null {
  if (typeof window === 'undefined') return null
  return (window as any).jaitDesktop ?? null
}

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).jaitDesktop || !!(window as any).Capacitor
}

/**
 * Initialise the in-memory token on app startup.
 *
 * - **Electron**: loads from the OS credential store (safeStorage).
 * - **Web**: calls `POST /auth/refresh` — the HTTP-only cookie authenticates
 *   the request and the server returns a fresh access token.
 * - **Capacitor**: loads from localStorage.
 */
export async function initAuthToken(): Promise<void> {
  // 1️⃣ Electron — OS credential store
  const desktop = getDesktopBridge()
  if (desktop?.credentialGet) {
    try {
      const result = await desktop.credentialGet(CREDENTIAL_KEY)
      if (result?.value) {
        memoryToken = result.value
        return
      }
    } catch { /* fall through */ }
  }

  // 2️⃣ Web (browser) — refresh from HTTP-only cookie
  if (!isNativeApp()) {
    // Migrate any leftover localStorage / sessionStorage tokens first —
    // these are from before the HTTP-only cookie era.
    _migrateLegacyStorage()

    // If we have a legacy token in localStorage, use it and let the
    // normal Bearer flow work until the server sets the cookie.
    const ls = readLocalStorage()
    const legacyLocal = ls?.getItem(TOKEN_KEY) ?? null
    if (legacyLocal) {
      memoryToken = legacyLocal
      // Clear it — from now on the cookie is the persistence mechanism.
      ls?.removeItem(TOKEN_KEY)
      return
    }

    // Try cookie-based refresh
    try {
      const { getApiUrl } = await import('./gateway-url')
      const res = await fetch(`${getApiUrl()}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json() as { access_token: string }
        if (data.access_token) {
          memoryToken = data.access_token
          return
        }
      }
    } catch { /* not authenticated via cookie — user will see login */ }
    return
  }

  // 3️⃣ Capacitor — localStorage
  _migrateLegacyStorage()
  const ls = readLocalStorage()
  const saved = ls?.getItem(TOKEN_KEY) ?? null
  if (saved) {
    memoryToken = saved
  }
}

function _migrateLegacyStorage(): void {
  const sessionStorage = readSessionStorage()
  const ls = readLocalStorage()

  const sessionToken = sessionStorage?.getItem(TOKEN_KEY) ?? null
  if (sessionToken) {
    if (isNativeApp()) ls?.setItem(TOKEN_KEY, sessionToken)
    sessionStorage?.removeItem(TOKEN_KEY)
    if (!memoryToken) memoryToken = sessionToken
  }

  const legacyToken = ls?.getItem(LEGACY_TOKEN_KEY) ?? null
  if (legacyToken) {
    if (isNativeApp()) ls?.setItem(TOKEN_KEY, legacyToken)
    ls?.removeItem(LEGACY_TOKEN_KEY)
    if (!memoryToken) memoryToken = legacyToken
  }
}

export function getAuthToken(): string | null {
  return memoryToken
}

export function setAuthToken(token: string): void {
  memoryToken = token

  if (isNativeApp()) {
    // Native apps store in localStorage + OS credential store
    readLocalStorage()?.setItem(TOKEN_KEY, token)
    readLocalStorage()?.removeItem(LEGACY_TOKEN_KEY)
    readSessionStorage()?.removeItem(TOKEN_KEY)

    const desktop = getDesktopBridge()
    if (desktop?.credentialStore) {
      desktop.credentialStore(CREDENTIAL_KEY, token).catch(() => {})
    }
  }
  // On web: the server already set an HTTP-only cookie in the login response.
  // No client-side storage needed.
}

export function clearAuthToken(): void {
  memoryToken = null

  // Clean up any client-side storage
  readLocalStorage()?.removeItem(TOKEN_KEY)
  readLocalStorage()?.removeItem(LEGACY_TOKEN_KEY)
  readSessionStorage()?.removeItem(TOKEN_KEY)

  if (isNativeApp()) {
    const desktop = getDesktopBridge()
    if (desktop?.credentialClear) {
      desktop.credentialClear(CREDENTIAL_KEY).catch(() => {})
    }
  }
}

/**
 * Clear the server-side HTTP-only cookie. Call on logout from the web app.
 */
export async function clearAuthCookie(): Promise<void> {
  if (isNativeApp()) return
  try {
    const { getApiUrl } = await import('./gateway-url')
    await fetch(`${getApiUrl()}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch { /* best-effort */ }
}

