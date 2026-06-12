import { useState } from 'react'
import type { FormEvent } from 'react'

export interface UseAuthFormOptions {
  login: (username: string, password: string) => Promise<unknown>
  register: (username: string, password: string) => Promise<unknown>
  /** Side effects to run after a successful login/register (e.g. close dialog, switch view). */
  onSuccess: () => void
}

/**
 * Owns the login/register form state and submit handlers. Extracted from the
 * `App` god component — the state cluster here is referenced only by the auth
 * form UI, so it lives cleanly in its own hook. Connection-level gateway state
 * (URL step, health check) stays in `App` since effects there depend on it.
 */
export function useAuthForm({ login, register, onSuccess }: UseAuthFormOptions) {
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('')
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (authSubmitting) return
    setAuthError(null)
    setAuthSubmitting(true)
    try {
      await login(loginUsername, loginPassword)
      setLoginPassword('')
      onSuccess()
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    if (authSubmitting) return
    setAuthError(null)
    if (!registerUsername || !registerPassword) {
      setAuthError('Username and password are required')
      return
    }
    if (registerPassword !== registerPasswordConfirm) {
      setAuthError('Passwords do not match')
      return
    }
    setAuthSubmitting(true)
    try {
      await register(registerUsername, registerPassword)
      setRegisterPassword('')
      setRegisterPasswordConfirm('')
      onSuccess()
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setAuthSubmitting(false)
    }
  }

  return {
    loginUsername,
    setLoginUsername,
    loginPassword,
    setLoginPassword,
    registerUsername,
    setRegisterUsername,
    registerPassword,
    setRegisterPassword,
    registerPasswordConfirm,
    setRegisterPasswordConfirm,
    authTab,
    setAuthTab,
    authSubmitting,
    showLoginPassword,
    setShowLoginPassword,
    showRegisterPassword,
    setShowRegisterPassword,
    showRegisterConfirmPassword,
    setShowRegisterConfirmPassword,
    authError,
    setAuthError,
    handleLogin,
    handleRegister,
  }
}
