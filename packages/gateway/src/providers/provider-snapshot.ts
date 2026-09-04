/**
 * Provider snapshot cache.
 *
 * Computing a provider's availability + auth status is expensive: it spawns the
 * provider CLI (and, for ACP providers, runs a full agent handshake). Doing that
 * inline on every `GET /api/providers` froze the initial page load while ~7
 * providers were probed.
 *
 * This cache computes the snapshot once, serves it immediately, and refreshes in
 * the background (stale-while-revalidate). Warm it at startup so the first page
 * load never pays the probe cost.
 */

import type { ProviderRegistry } from "./registry.js";
import type { ProviderAuthInfo, RuntimeMode } from "./contracts.js";

export interface ProviderSnapshot {
  id: string;
  providerType?: string;
  name: string;
  description: string;
  available: boolean;
  installed: boolean;
  unavailableReason?: string;
  modes: RuntimeMode[];
  auth?: ProviderAuthInfo;
}

/** How long a computed snapshot stays fresh before a background refresh. */
const SNAPSHOT_TTL_MS = 60_000;

export class ProviderSnapshotCache {
  private snapshot: ProviderSnapshot[] | null = null;
  private computedAt = 0;
  private inflight: Promise<ProviderSnapshot[]> | null = null;

  constructor(private readonly registry: ProviderRegistry) {}

  /**
   * Return the current snapshot. Serves cached data immediately when available;
   * refreshes in the background when stale. Only blocks on a cold cache (or when
   * `force` is set, e.g. an explicit user-triggered refresh).
   */
  async get(force = false): Promise<ProviderSnapshot[]> {
    const fresh = this.snapshot && Date.now() - this.computedAt < SNAPSHOT_TTL_MS;

    if (!force && fresh) return this.snapshot!;

    // Stale but present: kick a background refresh, return what we have now.
    if (!force && this.snapshot) {
      void this.refresh().catch(() => {});
      return this.snapshot;
    }

    // Cold cache or forced refresh: must wait for a computation.
    return this.refresh();
  }

  invalidate(): void {
    this.snapshot = null;
    this.computedAt = 0;
  }

  /** Kick a background refresh without awaiting it (used to warm at startup). */
  warm(): void {
    void this.refresh().catch(() => {});
  }

  private refresh(): Promise<ProviderSnapshot[]> {
    if (this.inflight) return this.inflight;
    this.inflight = this.compute()
      .then((snap) => {
        this.snapshot = snap;
        this.computedAt = Date.now();
        return snap;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async compute(): Promise<ProviderSnapshot[]> {
    const providers = this.registry.list();
    return Promise.all(
      providers.map(async (p) => {
        const installed = await p.checkAvailability().catch(() => false);
        const auth = await p.getAuthStatus?.().catch(() =>
          p.info.auth
            ? { ...p.info.auth, authenticated: null, detail: "Failed to check provider auth status." }
            : undefined,
        );
        return {
          id: p.id,
          providerType: p.providerType ?? p.info.providerType,
          name: p.info.name,
          description: p.info.description,
          available: p.info.available,
          installed,
          unavailableReason: p.info.unavailableReason,
          modes: p.info.modes,
          auth: auth ?? p.info.auth,
        };
      }),
    );
  }
}
