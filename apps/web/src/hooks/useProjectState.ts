import { useState, useEffect, useRef, useCallback } from 'react'
import { getApiUrl } from '@/lib/gateway-url'
import { fetchStateBatched, primeStateValue } from '@/lib/state-batch'

const API_URL = getApiUrl()

function authHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export function createProjectStatePersistRequestInit(
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

export function getProjectStateRequestKey(
  projectId: string | null,
  key: string,
  token?: string | null,
): string | null {
  return projectId && token ? `${projectId}:${key}:${token}` : null
}

export function resolveProjectStateSnapshot<T>(
  value: T | null,
  loading: boolean,
  requestKey: string | null,
  loadedRequestKey: string | null,
): { value: T | null; loading: boolean } {
  if (!requestKey) return { value: null, loading: false }
  const matchesCurrentProject = requestKey === loadedRequestKey
  return {
    value: matchesCurrentProject ? value : null,
    loading: loading || !matchesCurrentProject,
  }
}

export function useProjectState<T>(
  projectId: string | null,
  key: string,
  token?: string | null,
): [T | null, (value: T | null, options?: { immediate?: boolean }) => void, boolean] {
  const [value, setValueLocal] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localWriteVersionRef = useRef(0)
  const requestKey = getProjectStateRequestKey(projectId, key, token)

  useEffect(() => {
    if (!projectId || !token) {
      setValueLocal(null)
      setLoading(false)
      setLoadedRequestKey(null)
      return
    }

    // Reset immediately so stale values from the previous project are not
    // consumed before the fetch for the new project completes.
    setValueLocal(null)
    setLoadedRequestKey(null)

    let cancelled = false
    const fetchVersion = localWriteVersionRef.current
    const nextRequestKey = getProjectStateRequestKey(projectId, key, token)
    setLoading(true)

    fetchStateBatched('projects', projectId, key, token)
      .then((val) => {
        if (cancelled) return
        if (fetchVersion !== localWriteVersionRef.current) return
        const next = val as T | null
        setValueLocal(next)
      })
      .catch(() => {
        if (!cancelled) setValueLocal(null)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setLoadedRequestKey(nextRequestKey)
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId, key, token])

  const setValue = useCallback((next: T | null, options?: { immediate?: boolean }) => {
    localWriteVersionRef.current += 1
    setValueLocal(next)
    setLoadedRequestKey(requestKey)

    if (!projectId || !token) return
    primeStateValue('projects', projectId, token, key, next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const persist = () => {
      fetch(`${API_URL}/api/projects/${projectId}/state`, {
        ...createProjectStatePersistRequestInit(token, key, next, options),
      }).catch(() => undefined)
    }
    if (options?.immediate) {
      persist()
      return
    }
    debounceRef.current = setTimeout(() => {
      persist()
    }, 300)
  }, [projectId, key, token, requestKey])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const snapshot = resolveProjectStateSnapshot(value, loading, requestKey, loadedRequestKey)
  return [snapshot.value, setValue, snapshot.loading]
}
