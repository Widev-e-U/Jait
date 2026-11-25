const TTL_MS = 10 * 60_000
const MAX_BYTES = 64 * 1024 * 1024

interface Entry { blob?: Blob; pending?: Promise<Blob>; expires: number }

/** Small in-memory TTL + size-bounded cache so recently loaded media isn't refetched on remount. */
const entries = new Map<string, Entry>()
let cachedBytes = 0

function evict(now: number) {
  for (const [key, entry] of entries) {
    if (entry.blob && (entry.expires <= now || cachedBytes > MAX_BYTES)) {
      cachedBytes -= entry.blob.size
      entries.delete(key)
    }
  }
}

export function peekCachedBlob(key: string): Blob | undefined {
  const now = Date.now()
  evict(now)
  const hit = entries.get(key)
  if (!hit?.blob) return undefined
  entries.delete(key)
  entries.set(key, { ...hit, expires: now + TTL_MS })
  return hit.blob
}

export function cachedBlob(key: string, load: () => Promise<Blob>): Promise<Blob> {
  const blob = peekCachedBlob(key)
  if (blob) return Promise.resolve(blob)
  const hit = entries.get(key)
  if (hit?.pending) return hit.pending

  const entry: Entry = { expires: 0 }
  const pending = load().then(blob => {
    if (entries.get(key) === entry) {
      entries.delete(key)
      entries.set(key, { blob, expires: Date.now() + TTL_MS })
      cachedBytes += blob.size
      evict(Date.now())
    }
    return blob
  }, error => {
    if (entries.get(key) === entry) entries.delete(key)
    throw error
  })
  entry.pending = pending
  entries.set(key, entry)
  return pending
}

export function clearBlobCache() {
  entries.clear()
  cachedBytes = 0
}
