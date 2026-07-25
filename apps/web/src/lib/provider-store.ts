/**
 * Shared provider snapshot store.
 *
 * Every screen that needs "which providers exist and where do they run" reads
 * from here. Previously the chat selectors, the settings page and the
 * automation hook each fetched `/api/providers` on their own schedule with
 * their own caches, so two panels could disagree about the same provider and a
 * project switch triggered several redundant probes.
 *
 * One store, one in-flight request, one cache:
 *  - `refreshProviders()` serves the shared cache when it is still warm.
 *  - `refreshProviders({ fresh: true })` forces a server-side re-probe, rate
 *    limited because probing spawns provider CLIs on the gateway.
 *  - node connect/disconnect events call `refreshProviders()` so the list
 *    tracks devices coming and going without any polling.
 */

import { agentsApi, type ProviderInfo, type RemoteProviderInfo } from './agents-api'
import { getAuthToken } from './auth-token'

export interface ProviderSnapshot {
  providers: ProviderInfo[]
  remoteProviders: RemoteProviderInfo[]
  /** True once a response has been received at least once. */
  loaded: boolean
  loading: boolean
  error: string | null
}

/** A cached snapshot older than this is refreshed on the next read. */
const STALE_AFTER_MS = 30_000
/** Minimum spacing between forced server-side re-probes (they spawn CLIs). */
const FRESH_PROBE_INTERVAL_MS = 10_000

const EMPTY_SNAPSHOT: ProviderSnapshot = {
  providers: [],
  remoteProviders: [],
  loaded: false,
  loading: false,
  error: null,
}

let snapshot: ProviderSnapshot = EMPTY_SNAPSHOT
let inflight: Promise<ProviderSnapshot> | null = null
let inflightIsFresh = false
let loadedAt = 0
let lastFreshAt = 0

const listeners = new Set<() => void>()

function setSnapshot(next: Partial<ProviderSnapshot>): void {
  snapshot = { ...snapshot, ...next }
  for (const listener of listeners) listener()
}

export function getProviderSnapshot(): ProviderSnapshot {
  return snapshot
}

export function subscribeToProviders(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Load providers, reusing the shared cache and any in-flight request.
 *
 * @param fresh Ask the gateway to re-probe provider availability/auth. Opening
 *   a picker uses this; it is throttled so repeated opens do not hammer the
 *   provider CLIs.
 * @param force Bypass the throttle. Use right after a login/logout, where the
 *   answer is known to have just changed.
 */
export function refreshProviders({ fresh = false, force = false } = {}): Promise<ProviderSnapshot> {
  if (!getAuthToken()) return Promise.resolve(snapshot)

  const now = Date.now()
  const freshAllowed = fresh && (force || now - lastFreshAt >= FRESH_PROBE_INTERVAL_MS)
  // An in-flight request satisfies this call when it is at least as thorough.
  if (inflight && (!freshAllowed || inflightIsFresh)) return inflight
  if (!fresh && !inflight && snapshot.loaded && now - loadedAt < STALE_AFTER_MS) {
    return Promise.resolve(snapshot)
  }

  inflightIsFresh = freshAllowed
  if (freshAllowed) lastFreshAt = now
  setSnapshot({ loading: true })

  const request: Promise<ProviderSnapshot> = (freshAllowed ? agentsApi.listProvidersFresh() : agentsApi.listProvidersLive())
    .then((result) => {
      loadedAt = Date.now()
      setSnapshot({
        providers: result.providers,
        remoteProviders: result.remoteProviders,
        loaded: true,
        loading: false,
        error: null,
      })
      return snapshot
    })
    .catch((error: unknown) => {
      setSnapshot({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load providers',
      })
      return snapshot
    })
    .finally(() => {
      // A forced refresh can overtake an in-flight cheap one; only the request
      // that is still current may clear the shared handle.
      if (inflight === request) {
        inflight = null
        inflightIsFresh = false
      }
    })

  inflight = request
  return request
}

/** Drop the cache so the next read re-fetches (provider accounts added/removed). */
export function invalidateProviders(): void {
  loadedAt = 0
  lastFreshAt = 0
}

/** Test seam — resets module state between test cases. */
export function resetProviderStore(): void {
  snapshot = EMPTY_SNAPSHOT
  inflight = null
  inflightIsFresh = false
  loadedAt = 0
  lastFreshAt = 0
  listeners.clear()
}
