import { useState, useEffect, useRef, useCallback } from 'react'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

function authHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export function useWorkspaceState<T>(
  workspaceId: string | null,
  key: string,
  token?: string | null,
): [T | null, (value: T | null) => void, boolean] {
  const [value, setValueLocal] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<T | null>(null)

  useEffect(() => {
    if (!workspaceId || !token) {
      setValueLocal(null)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`${API_URL}/api/workspaces/${workspaceId}/state?keys=${encodeURIComponent(key)}`, {
      headers: authHeaders(token),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Record<string, unknown> | null) => {
        if (cancelled) return
        const next = data?.[key] ?? null
        setValueLocal(next as T | null)
        latestRef.current = next as T | null
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
  }, [workspaceId, key, token])

  const setValue = useCallback((next: T | null) => {
    setValueLocal(next)
    latestRef.current = next

    if (!workspaceId || !token) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch(`${API_URL}/api/workspaces/${workspaceId}/state`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ [key]: latestRef.current }),
      }).catch(() => undefined)
    }, 300)
  }, [workspaceId, key, token])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return [value, setValue, loading]
}
