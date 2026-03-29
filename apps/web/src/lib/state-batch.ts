/**
 * Microtask-batched state fetcher.
 *
 * Multiple `useSessionState` / `useWorkspaceState` hooks fire their fetch
 * effects in the same React commit.  Instead of one HTTP request per key,
 * this module collects all keys requested in the same microtask and issues
 * a single `GET /api/{sessions|workspaces}/:id/state?keys=a,b,c` call.
 */
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

type Callback = { resolve: (val: unknown) => void; reject: (err: unknown) => void }

interface BatchEntry {
  keys: Set<string>
  callbacks: Map<string, Callback[]>
  token: string
}

const pending = new Map<string, BatchEntry>()

/**
 * Request a single state key.  All calls that land in the same microtask
 * for the same entity are merged into one HTTP request.
 */
export function fetchStateBatched(
  entityType: 'sessions' | 'workspaces',
  entityId: string,
  key: string,
  token: string,
): Promise<unknown> {
  const batchKey = `${entityType}:${entityId}`
  let entry = pending.get(batchKey)

  if (!entry) {
    entry = { keys: new Set(), callbacks: new Map(), token }
    pending.set(batchKey, entry)

    // Flush after all same-tick effects have registered their keys
    queueMicrotask(() => {
      const e = pending.get(batchKey)
      if (!e) return
      pending.delete(batchKey)

      const allKeys = [...e.keys].join(',')
      fetch(`${API_URL}/api/${entityType}/${entityId}/state?keys=${encodeURIComponent(allKeys)}`, {
        headers: authHeaders(e.token),
      })
        .then(res => (res.ok ? res.json() : null))
        .then((data: Record<string, unknown> | null) => {
          for (const [k, cbs] of e.callbacks) {
            const val = data?.[k] ?? null
            for (const cb of cbs) cb.resolve(val)
          }
        })
        .catch(err => {
          for (const cbs of e.callbacks.values()) {
            for (const cb of cbs) cb.reject(err)
          }
        })
    })
  }

  entry.keys.add(key)
  return new Promise<unknown>((resolve, reject) => {
    let arr = entry!.callbacks.get(key)
    if (!arr) {
      arr = []
      entry!.callbacks.set(key, arr)
    }
    arr.push({ resolve, reject })
  })
}
