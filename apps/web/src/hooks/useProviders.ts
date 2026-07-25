/**
 * React binding for the shared provider store.
 *
 * Components get the same snapshot and share a single `/api/providers`
 * request, so the provider list can never differ between two open panels.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  getProviderSnapshot,
  refreshProviders,
  subscribeToProviders,
  type ProviderSnapshot,
} from '@/lib/provider-store'

export interface UseProvidersResult extends ProviderSnapshot {
  /**
   * Reload providers. `fresh` asks the gateway to re-probe (throttled);
   * `force` bypasses the throttle for known auth changes.
   */
  refresh: (options?: { fresh?: boolean; force?: boolean }) => Promise<ProviderSnapshot>
}

export function useProviders(): UseProvidersResult {
  const snapshot = useSyncExternalStore(subscribeToProviders, getProviderSnapshot, getProviderSnapshot)

  useEffect(() => {
    void refreshProviders()
  }, [])

  const refresh = useCallback(
    (options?: { fresh?: boolean; force?: boolean }) => refreshProviders(options),
    [],
  )

  return { ...snapshot, refresh }
}
