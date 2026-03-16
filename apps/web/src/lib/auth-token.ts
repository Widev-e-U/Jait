const SESSION_TOKEN_KEY = 'jait-auth-token'
const LEGACY_TOKEN_KEY = 'token'

let memoryToken: string | null = null

function readSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function readLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function getAuthToken(): string | null {
  const sessionStorage = readSessionStorage()
  const sessionToken = sessionStorage?.getItem(SESSION_TOKEN_KEY) ?? null
  if (sessionToken) {
    memoryToken = sessionToken
    return sessionToken
  }

  const localStorage = readLocalStorage()
  const legacyToken = localStorage?.getItem(LEGACY_TOKEN_KEY) ?? null
  if (legacyToken) {
    sessionStorage?.setItem(SESSION_TOKEN_KEY, legacyToken)
    localStorage?.removeItem(LEGACY_TOKEN_KEY)
    memoryToken = legacyToken
    return legacyToken
  }

  return memoryToken
}

export function setAuthToken(token: string): void {
  memoryToken = token
  readSessionStorage()?.setItem(SESSION_TOKEN_KEY, token)
  readLocalStorage()?.removeItem(LEGACY_TOKEN_KEY)
}

export function clearAuthToken(): void {
  memoryToken = null
  readSessionStorage()?.removeItem(SESSION_TOKEN_KEY)
  readLocalStorage()?.removeItem(LEGACY_TOKEN_KEY)
}

