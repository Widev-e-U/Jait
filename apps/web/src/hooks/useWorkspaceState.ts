import { useState, useEffect, useRef, useCallback } from 'react'
import { getApiUrl } from '@/lib/gateway-url'
import { fetchStateBatched } from '@/lib/state-batch'

const API_URL = getApiUrl()

function authHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export function createWorkspaceStatePersistRequestInit(
  token: string | null | undefined,
  key: string,
  value: unknown,
  options?: { immediate?: boolean },
): RequestInit {
  return {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ [key]: value }),
    // `keepalive` makes immediate writes much more reliable during mobile
    // reloads/navigation where the document can be torn down mid-request.
    keepalive: options?.immediate === true,
  }
}

export function useWorkspaceState<T>(
  workspaceId: string | null,
  key: string,
  token?: string | null,
): [T | null, (value: T | null, options?: { immediate?: boolean }) => void, boolean] {
  const [value, setValueLocal] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<T | null>(null)

  useEffect(() => {
    if (!workspaceId || !token) {
      setValueLocal(null)
      return
    }

    // Reset immediately so stale values from the previous workspace are not
    // consumed before the fetch for the new workspace completes.
    setValueLocal(null)

    let cancelled = false
    setLoading(true)

    fetchStateBatched('workspaces', workspaceId, key, token!)
      .then((val) => {
        if (cancelled) return
        const next = val as T | null
        setValueLocal(next)
        latestRef.current = next
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

  const setValue = useCallback((next: T | null, options?: { immediate?: boolean }) => {
    setValueLocal(next)
    latestRef.current = next

    if (!workspaceId || !token) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const persist = () => {
      fetch(`${API_URL}/api/workspaces/${workspaceId}/state`, {
        ...createWorkspaceStatePersistRequestInit(token, key, latestRef.current, options),
      }).catch(() => undefined)
    }
    if (options?.immediate) {
      persist()
      return
    }
    debounceRef.current = setTimeout(() => {
      persist()
    }, 300)
  }, [workspaceId, key, token])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return [value, setValue, loading]
}
