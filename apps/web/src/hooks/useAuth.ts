import { useState, useEffect, useCallback } from 'react'
import { clearAuthToken, getAuthToken, setAuthToken, initAuthToken, clearAuthCookie } from '@/lib/auth-token'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

export type ThemeMode = 'light' | 'dark' | 'system'
export type SttProvider = 'wyoming' | 'whisper'
export type ChatProvider = 'jait' | 'codex' | 'claude-code'

interface User {
  id: string
  username: string
}

interface UserSettings {
  theme: ThemeMode
  api_keys: Record<string, string>
  stt_provider: SttProvider
  chat_provider: ChatProvider
  workspace_picker_path: string | null
  workspace_picker_node_id: string | null
  updated_at: string
}

interface AuthState {
  user: User | null
  token: string | null
  settings: UserSettings | null
  isLoading: boolean
}

interface AuthResponse {
  access_token: string
  user: User
}

const EMPTY_SETTINGS: UserSettings = {
  theme: 'system',
  api_keys: {},
  stt_provider: 'whisper',
  chat_provider: 'jait',
  workspace_picker_path: null,
  workspace_picker_node_id: null,
  updated_at: new Date(0).toISOString(),
}

async function fetchSettings(token: string): Promise<UserSettings | null> {
  try {
    const response = await fetch(`${API_URL}/api/auth/settings`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    if (!response.ok) return null
    return await response.json() as UserSettings
  } catch {
    return null
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    settings: null,
    isLoading: true,
  })

  const loadFromToken = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        clearAuthToken()
        setState({ user: null, token: null, settings: null, isLoading: false })
        return
      }

      const user = await response.json() as User
      const settings = await fetchSettings(token)
      setState({
        user,
        token,
        settings: settings ?? EMPTY_SETTINGS,
        isLoading: false,
      })
    } catch {
      clearAuthToken()
      setState({ user: null, token: null, settings: null, isLoading: false })
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await initAuthToken()
      const token = getAuthToken()
      if (token) {
        void loadFromToken(token)
        return
      }
      setState((prev) => ({ ...prev, isLoading: false }))
    })()
  }, [loadFromToken])

  const persistAuth = useCallback(async (payload: AuthResponse) => {
    setAuthToken(payload.access_token)
    const settings = await fetchSettings(payload.access_token)
    setState({
      user: payload.user,
      token: payload.access_token,
      settings: settings ?? EMPTY_SETTINGS,
      isLoading: false,
    })
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }))
      throw new Error(error.detail ?? 'Login failed')
    }
    const data = await response.json() as AuthResponse
    await persistAuth(data)
    return data
  }, [persistAuth])

  const register = useCallback(async (username: string, password: string) => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Registration failed' }))
      throw new Error(error.detail ?? 'Registration failed')
    }
    const data = await response.json() as AuthResponse
    await persistAuth(data)
    return data
  }, [persistAuth])

  const logout = useCallback(() => {
    clearAuthToken()
    void clearAuthCookie()
    setState({ user: null, token: null, settings: null, isLoading: false })
  }, [])

  const refreshSettings = useCallback(async () => {
    if (!state.token) return null
    const settings = await fetchSettings(state.token)
    if (settings) {
      setState((prev) => ({ ...prev, settings }))
      return settings
    }
    return null
  }, [state.token])

  const updateSettings = useCallback(async (patch: {
    theme?: ThemeMode
    api_keys?: Record<string, string>
    stt_provider?: SttProvider
    chat_provider?: ChatProvider
    workspace_picker_path?: string | null
    workspace_picker_node_id?: string | null
  }) => {
    if (!state.token) throw new Error('Not authenticated')
    const response = await fetch(`${API_URL}/api/auth/settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${state.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to update settings' }))
      throw new Error(error.detail ?? 'Failed to update settings')
    }
    const settings = await response.json() as UserSettings
    setState((prev) => ({ ...prev, settings }))
    return settings
  }, [state.token])

  const clearSessionArchive = useCallback(async () => {
    if (!state.token) throw new Error('Not authenticated')
    const response = await fetch(`${API_URL}/api/auth/settings/archive`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${state.token}`,
      },
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to clear archive' }))
      throw new Error(error.detail ?? 'Failed to clear archive')
    }
    return await response.json() as { ok: boolean; removed: number }
  }, [state.token])

  const bindSession = useCallback(async (sessionId: string) => {
    if (!state.token) return
    try {
      await fetch(`${API_URL}/api/auth/session/bind`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId }),
      })
    } catch {
      // no-op
    }
  }, [state.token])

  return {
    user: state.user,
    token: state.token,
    settings: state.settings ?? EMPTY_SETTINGS,
    isLoading: state.isLoading,
    isAuthenticated: !!state.user,
    login,
    register,
    logout,
    bindSession,
    refreshSettings,
    updateSettings,
    clearSessionArchive,
  }
}
