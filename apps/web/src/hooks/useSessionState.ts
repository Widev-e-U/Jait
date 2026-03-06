/**
 * useSessionState — Syncs per-session key-value state with the backend.
 *
 * Usage:
 *   const [value, setValue] = useSessionState<MyType>(sessionId, 'workspace.panel')
 *
 * - On mount / sessionId change: fetches value from GET /api/sessions/:id/state?keys=<key>
 * - setValue does an optimistic local update + debounced PATCH to server
 * - Pass `null` to delete the key
 */
import { useState, useEffect, useRef, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

function authHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export function useSessionState<T>(
  sessionId: string | null,
  key: string,
  token?: string | null,
): [T | null, (value: T | null) => void, boolean] {
  const [value, setValueLocal] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<T | null>(null)

  // Fetch on mount / session change
  useEffect(() => {
    if (!sessionId || !token) {
      setValueLocal(null)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`${API_URL}/api/sessions/${sessionId}/state?keys=${encodeURIComponent(key)}`, {
      headers: authHeaders(token),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Record<string, unknown> | null) => {
        if (cancelled) return
        const val = data?.[key] ?? null
        setValueLocal(val as T | null)
        latestRef.current = val as T | null
      })
      .catch(() => {
        if (!cancelled) setValueLocal(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [sessionId, key, token])

  // Setter: optimistic local + debounced PATCH
  const setValue = useCallback(
    (next: T | null) => {
      setValueLocal(next)
      latestRef.current = next

      if (!sessionId || !token) return

      // Debounce writes to avoid rapid-fire PATCHes
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        fetch(`${API_URL}/api/sessions/${sessionId}/state`, {
          method: 'PATCH',
          headers: authHeaders(token),
          body: JSON.stringify({ [key]: latestRef.current }),
        }).catch(() => {
          // Silently ignore write failures — local state stays optimistic
        })
      }, 300)
    },
    [sessionId, key, token],
  )

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return [value, setValue, loading]
}
