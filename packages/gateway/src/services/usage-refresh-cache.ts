/** Gateway-wide request sharing, freshness and failure backoff for usage reads. */
export class UsageRefreshCache<T> {
  private entries = new Map<string, {
    promise: Promise<T>; completedAt: number | null; nextAt: number; failures: number;
  }>();

  constructor(private readonly now = Date.now) {}

  run(key: string, load: () => Promise<T>, options: {
    force?: boolean; failed?: (value: T) => boolean;
  } = {}): Promise<T> {
    const previous = this.entries.get(key);
    const now = this.now();
    // A manual refresh bypasses successful freshness and failure backoff. It
    // still joins a request that is genuinely in flight, because that request
    // has not produced a result yet. Backoff keeps automatic refreshes from
    // hammering a failing provider; it must not make the Refresh button replay
    // an already-settled answer and look dead.
    if (previous) {
      const inFlight = previous.completedAt === null;
      if (inFlight || (now < previous.nextAt && !options.force)) return previous.promise;
    }
    // Do not evict throttled or in-flight entries: eviction could bypass limits.
    if (!previous && this.entries.size >= 1000) {
      for (const [oldKey, old] of this.entries) {
        if (old.completedAt !== null && old.nextAt <= now) this.entries.delete(oldKey);
      }
      if (this.entries.size >= 1000) return Promise.reject(new Error("Usage refresh capacity reached; try again later."));
    }
    const entry = { promise: null as unknown as Promise<T>, completedAt: null as number | null, nextAt: Infinity, failures: previous?.failures ?? 0 };
    const complete = (failed: boolean) => {
      entry.completedAt = this.now();
      entry.failures = failed ? entry.failures + 1 : 0;
      entry.nextAt = entry.completedAt + Math.min(30 * 60_000, 5 * 60_000 * 2 ** Math.min(entry.failures, 3));
    };
    entry.promise = Promise.resolve().then(load).then(value => {
      complete(options.failed?.(value) ?? false);
      return value;
    }, error => {
      complete(true);
      throw error;
    });
    this.entries.set(key, entry);
    return entry.promise;
  }
}
