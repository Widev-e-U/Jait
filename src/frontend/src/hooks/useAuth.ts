import { useState, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface User {
  id: string
  email: string
  name: string | null
  picture: string | null
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
  })

  // Load token from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      // Verify token and get user info
      fetchUser(token)
    } else {
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [])

  const fetchUser = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const user = await response.json()
        setState({ user, token, isLoading: false })
      } else {
        // Token invalid, clear it
        localStorage.removeItem('token')
        setState({ user: null, token: null, isLoading: false })
      }
    } catch {
      localStorage.removeItem('token')
      setState({ user: null, token: null, isLoading: false })
    }
  }

  const loginWithGoogle = useCallback(async (credential: string) => {
    try {
      const response = await fetch(`${API_URL}/auth/google/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credential }),
      })

      if (!response.ok) {
        throw new Error('Login failed')
      }

      const data = await response.json()
      localStorage.setItem('token', data.access_token)
      setState({
        user: data.user,
        token: data.access_token,
        isLoading: false,
      })

      return data
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setState({ user: null, token: null, isLoading: false })
  }, [])

  const bindSession = useCallback(async (sessionId: string) => {
    if (!state.token) return

    try {
      await fetch(`${API_URL}/auth/session/bind`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId }),
      })
    } catch (error) {
      console.error('Failed to bind session:', error)
    }
  }, [state.token])

  return {
    user: state.user,
    token: state.token,
    isLoading: state.isLoading,
    isAuthenticated: !!state.user,
    loginWithGoogle,
    logout,
    bindSession,
  }
}
