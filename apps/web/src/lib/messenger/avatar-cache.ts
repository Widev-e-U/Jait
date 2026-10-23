/** Avatars have immutable MXC URLs; a changed picture gets a new cache key. */
const CACHE_NAME = 'jait-messenger-avatars-v1'
const MAX_ENTRIES = 256
const MAX_AVATAR_BYTES = 1024 * 1024
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
let writes = Promise.resolve()

/** Storage failures are cosmetic: keep loading avatars through the authenticated store. */
export async function cachedAvatarBlob(scope: string, mxcUrl: string, load: () => Promise<Blob>): Promise<Blob> {
  let cache: Cache | undefined
  let key: string | undefined
  try {
    if (typeof caches !== 'undefined') {
      // This is only a local cache key; it is never fetched from the network.
      const url = new URL('/__jait_messenger_avatar__', window.location.origin)
      url.search = new URLSearchParams({ scope, mxc: mxcUrl }).toString()
      key = url.href
      cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(key)
      if (cached) {
        const savedAt = Number(cached.headers.get('X-Jait-Cached-At'))
        if (savedAt > 0 && Date.now() - savedAt < MAX_AGE_MS) return await cached.blob()
        await cache.delete(key)
      }
    }
  } catch { /* Storage may be disabled or full. */ }

  const blob = await load()
  if (cache && key && blob.size > 0 && blob.size <= MAX_AVATAR_BYTES) {
    const target = cache
    const cacheKey = key
    const write = writes.then(async () => {
      await target.put(cacheKey, new Response(blob, { headers: { 'X-Jait-Cached-At': String(Date.now()) } }))
      const keys = await target.keys()
      for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await target.delete(old)
    })
    writes = write.catch(() => {})
    await writes
  }
  return blob
}
