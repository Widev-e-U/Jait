/**
 * useBackendState - Syncs per-entity key-value state with the backend.
 *
 * Unified replacement for the former useSessionState / useProjectState pair:
 *   const [value, setValue, loading] = useBackendState<T>('sessions', sessionId, 'chat.mode', token)
 *   const [ui, setUI, loadingUI]    = useBackendState<T>('projects', projectId, 'project.ui', token)
 *
 * - On mount / entity change: fetches value via the batched state fetcher
 * - setValue does an optimistic local update + debounced PATCH to the server;
 *   pass `{ immediate: true }` to write right away with `keepalive` (mobile reloads)
 * - Pass `null` to delete the key
 * - Values are only exposed for the entity whose request completed (no cross-entity leaks)
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { getApiUrl } from '@/lib/gateway-url'
import { fetchStateBatched, primeStateValue } from '@/lib/state-batch'

const API_URL = getApiUrl()

export type BackendStateScope = 'sessions' | 'projects'

export type BackendStateSetterOptions = { immediate?: boolean }

export type BackendStateSetter<T> = (value: T | null, options?: BackendStateSetterOptions) => void

export type BackendState<T> = [T | null, BackendStateSetter<T>, boolean]

function authHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export function createBackendStatePersistRequestInit(
  token: string | null | undefined,
  key: string,
  value: unknown,
  options?: BackendStateSetterOptions,
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

export function shouldApplyBackendStateFetchResult(
  fetchWriteVersion: number,
  currentWriteVersion: number,
): boolean {
  return fetchWriteVersion === currentWriteVersion
}

export function getBackendStateRequestKey(
  scopeId: string | null,
  key: string,
  token?: string | null,
): string | null {
  return scopeId && token ? `${scopeId}:${key}:${token}` : null
}

export function resolveBackendStateSnapshot<T>(
  value: T | null,
  loading: boolean,
  requestKey: string | null,
  loadedRequestKey: string | null,
): { value: T | null; loading: boolean } {
  if (!requestKey) return { value: null, loading: false }
  const matchesCurrentEntity = requestKey === loadedRequestKey
  return {
    value: matchesCurrentEntity ? value : null,
    loading: loading || !matchesCurrentEntity,
  }
}

export function useBackendState<T>(
  scope: BackendStateScope,
  id: string | null,
  key: string,
  token?: string | null,
): BackendState<T> {
  const [value, setValueLocal] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<T | null>(null)
  const localWriteVersionRef = useRef(0)
  const requestKey = getBackendStateRequestKey(id, key, token)

  // Fetch on mount / entity change
  useEffect(() => {
    if (!id || !token) {
      setValueLocal(null)
      setLoading(false)
      setLoadedRequestKey(null)
      return
    }

    // Cancel any pending debounced PATCH from the previous entity —
    // otherwise it fires after latestRef is reset to null below and
    // silently deletes the key for the old entity (e.g. chat.providerRuntimeMode).
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    // Reset to null immediately so stale values from the previous entity
    // don't briefly leak into UI while the fetch for the new one completes.
    setValueLocal(null)
    latestRef.current = null
    setLoadedRequestKey(null)

    let cancelled = false
    const fetchVersion = localWriteVersionRef.current
    const nextRequestKey = getBackendStateRequestKey(id, key, token)
    setLoading(true)

    fetchStateBatched(scope, id, key, token)
      .then((val) => {
        if (cancelled) return
        if (!shouldApplyBackendStateFetchResult(fetchVersion, localWriteVersionRef.current)) return
        const next = val as T | null
        setValueLocal(next)
        latestRef.current = next
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
  }, [scope, id, key, token])

  // Setter: optimistic local + debounced (or immediate) PATCH
  const setValue = useCallback<BackendStateSetter<T>>(
    (next, options) => {
      localWriteVersionRef.current += 1
      setValueLocal(next)
      latestRef.current = next
      // Keep the optimistic value visible: an in-flight fetch for this entity
      // would otherwise null it out once the snapshot guard re-evaluates.
      setLoadedRequestKey(requestKey)

      if (!id || !token) return
      primeStateValue(scope, id, token, key, next)

      const persist = () => {
        fetch(`${API_URL}/api/${scope}/${id}/state`, {
          ...createBackendStatePersistRequestInit(token, key, latestRef.current, options),
        }).catch(() => {
          // Silently ignore write failures - local state stays optimistic
        })
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (options?.immediate) {
        persist()
        return
      }
      debounceRef.current = setTimeout(persist, 300)
    },
    [scope, id, key, token, requestKey],
  )

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const snapshot = resolveBackendStateSnapshot(value, loading, requestKey, loadedRequestKey)
  return [snapshot.value, setValue, snapshot.loading]
}