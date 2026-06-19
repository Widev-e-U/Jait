import type { LlmContextFlow } from '@/hooks/useChat'
import { getApiUrl } from './gateway-url'

/**
 * Process-wide cache for the (potentially multi-MB) contextFlow payloads that
 * are lazy-loaded per message. Chat messages unmount/remount as the list
 * virtualizes and as the user re-opens the trace dialog, so keeping the
 * fetched payload in a module-level cache avoids a re-fetch on every reopen.
 *
 * Entries are keyed by `${sessionId}:${messageIndex}`. The cache also
 * de-duplicates concurrent in-flight requests for the same key.
 */

export interface CachedContextFlow {
  flow: LlmContextFlow | null
  /** epoch ms when the entry was stored */
  at: number
}

const cache = new Map<string, CachedContextFlow>()
const inFlight = new Map<string, Promise<CachedContextFlow>>()

/** Bump to invalidate all entries (e.g. after auth/workspace switch). */
const cacheVersionRef = { current: 0 }

function cacheKey(sessionId: string, messageIndex: number): string {
  return `${cacheVersionRef.current}:${sessionId}:${messageIndex}`
}

export function getCachedContextFlow(sessionId: string, messageIndex: number): LlmContextFlow | null | undefined {
  const entry = cache.get(cacheKey(sessionId, messageIndex))
  return entry?.flow
}

export function isContextFlowInFlight(sessionId: string, messageIndex: number): boolean {
  return inFlight.has(cacheKey(sessionId, messageIndex))
}

export function setCachedContextFlow(sessionId: string, messageIndex: number, flow: LlmContextFlow | null): void {
  cache.set(cacheKey(sessionId, messageIndex), { flow, at: Date.now() })
}

/**
 * Fetch (and cache) a contextFlow payload. Concurrent callers for the same
 * key share a single network request. Returns the cached payload if present.
 */
export async function fetchContextFlow(
  sessionId: string,
  messageIndex: number,
  authToken?: string,
): Promise<LlmContextFlow | null> {
  const key = cacheKey(sessionId, messageIndex)

  const cached = cache.get(key)
  if (cached) return cached.flow

  const existing = inFlight.get(key)
  if (existing) {
    const result = await existing
    return result.flow
  }

  const promise = (async (): Promise<CachedContextFlow> => {
    try {
      const headers: Record<string, string> = {}
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`
      const res = await fetch(
        `${getApiUrl()}/api/sessions/${sessionId}/messages/${messageIndex}/context-flow`,
        { headers },
      )
      if (!res.ok) {
        const entry: CachedContextFlow = { flow: null, at: Date.now() }
        cache.set(key, entry)
        return entry
      }
      const data = (await res.json()) as { contextFlow?: LlmContextFlow | null }
      const flow = data.contextFlow ?? null
      const entry: CachedContextFlow = { flow, at: Date.now() }
      cache.set(key, entry)
      return entry
    } catch {
      // Network/parse failure — do not poison the cache, allow a retry.
      return { flow: null, at: Date.now() }
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, promise)
  const result = await promise
  return result.flow
}

export function invalidateContextFlowCache(): void {
  cacheVersionRef.current += 1
  cache.clear()
  inFlight.clear()
}