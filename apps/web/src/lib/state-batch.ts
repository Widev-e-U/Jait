/**
 * Microtask-batched and cache-backed state fetcher.
 *
 * Multiple `useSessionState` / `useProjectState` hooks fire their fetch
 * effects in the same React commit. Instead of one HTTP request per key,
 * this module collects all keys requested in the same microtask and issues
 * a single `GET /api/{sessions|projects}/:id/state?keys=a,b,c` call.
 *
 * WebSocket full-state hydration can also prime this cache, which keeps
 * remounts / StrictMode from turning persisted UI state into repeated REST
 * reads after the gateway already pushed the authoritative state.
 */
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()
const STATE_CACHE_TTL_MS = 60_000

function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

type StateEntityType = 'sessions' | 'projects'
type Callback = { resolve: (val: unknown) => void; reject: (err: unknown) => void }

interface BatchEntry {
  keys: Set<string>
  callbacks: Map<string, Callback[]>
  token: string
}

interface CachedValue {
  expiresAt: number
  value: unknown
}

const pending = new Map<string, BatchEntry>()
const inFlight = new Map<string, Promise<unknown>>()
const cachedState = new Map<string, CachedValue>()

function getBatchKey(entityType: StateEntityType, entityId: string, token: string): string {
  return `${entityType}:${entityId}:${token}`
}

function getValueKey(entityType: StateEntityType, entityId: string, token: string, key: string): string {
  return `${getBatchKey(entityType, entityId, token)}:${key}`
}

function readCachedValue(cacheKey: string): { hit: boolean; value: unknown } {
  const cached = cachedState.get(cacheKey)
  if (!cached) return { hit: false, value: null }
  if (cached.expiresAt <= Date.now()) {
    cachedState.delete(cacheKey)
    return { hit: false, value: null }
  }
  return { hit: true, value: cached.value }
}

export function primeStateValue(
  entityType: StateEntityType,
  entityId: string,
  token: string,
  key: string,
  value: unknown,
): void {
  cachedState.set(getValueKey(entityType, entityId, token, key), {
    expiresAt: Date.now() + STATE_CACHE_TTL_MS,
    value,
  })
}

export function primeStateCache(
  entityType: StateEntityType,
  entityId: string,
  token: string,
  state: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(state)) {
    primeStateValue(entityType, entityId, token, key, value)
  }
}

export function resetStateBatchCacheForTests(): void {
  pending.clear()
  inFlight.clear()
  cachedState.clear()
}

function resolveBatchValue(
  entityType: StateEntityType,
  entityId: string,
  token: string,
  data: Record<string, unknown> | null,
  key: string,
): unknown {
  const val = data?.[key] ?? null
  primeStateValue(entityType, entityId, token, key, val)
  return val
}

/**
 * Request a single state key. All calls that land in the same microtask
 * for the same entity are merged into one HTTP request.
 */
export function fetchStateBatched(
  entityType: StateEntityType,
  entityId: string,
  key: string,
  token: string,
): Promise<unknown> {
  const cacheKey = getValueKey(entityType, entityId, token, key)
  const cached = readCachedValue(cacheKey)
  if (cached.hit) return Promise.resolve(cached.value)

  const currentInFlight = inFlight.get(cacheKey)
  if (currentInFlight) return currentInFlight

  const pendingKey = getBatchKey(entityType, entityId, token)
  let entry = pending.get(pendingKey)

  if (!entry) {
    entry = { keys: new Set(), callbacks: new Map(), token }
    pending.set(pendingKey, entry)

    // Flush after all same-tick effects have registered their keys.
    queueMicrotask(() => {
      const e = pending.get(pendingKey)
      if (!e) return
      pending.delete(pendingKey)

      const allKeys = [...e.keys].join(',')
      fetch(`${API_URL}/api/${entityType}/${entityId}/state?keys=${encodeURIComponent(allKeys)}`, {
        headers: authHeaders(e.token),
      })
        .then(res => (res.ok ? res.json() : null))
        .then((data: Record<string, unknown> | null) => {
          for (const [k, cbs] of e.callbacks) {
            const val = resolveBatchValue(entityType, entityId, e.token, data, k)
            for (const cb of cbs) cb.resolve(val)
          }
        })
        .catch(err => {
          for (const cbs of e.callbacks.values()) {
            for (const cb of cbs) cb.reject(err)
          }
        })
        .finally(() => {
          for (const k of e.keys) {
            inFlight.delete(getValueKey(entityType, entityId, e.token, k))
          }
        })
    })
  }

  entry.keys.add(key)
  const request = new Promise<unknown>((resolve, reject) => {
    let callbacks = entry!.callbacks.get(key)
    if (!callbacks) {
      callbacks = []
      entry!.callbacks.set(key, callbacks)
    }
    callbacks.push({ resolve, reject })
  })
  inFlight.set(cacheKey, request)
  return request
}
