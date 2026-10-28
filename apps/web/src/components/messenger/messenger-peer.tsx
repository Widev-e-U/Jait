import { useEffect, useState } from 'react'
import type { MessengerPresence } from '@/lib/messenger/model'
import { getApiUrl } from '@/lib/gateway-url'
import { cachedAvatarBlob } from '@/lib/messenger/avatar-cache'
import { useMessenger } from './messenger-provider'
import { TooltipHint } from '@/components/ui/tooltip'

/** Initials keep the header stable while the image loads, or when no avatar exists. */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return (words[0]!.slice(0, 2) || '?').toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

const DOT: Record<MessengerPresence, string> = {
  online: 'bg-emerald-500',
  unavailable: 'bg-amber-500',
  offline: 'bg-muted-foreground/50',
  unknown: '',
}

const SIZE = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-10 w-10 text-sm',
} as const

/**
 * Shared `mxc://` → object URL cache. The chats panel, the conversation header
 * and the message gutter all point at the same avatar, so a single fetch per
 * URI is shared by every mount and survives list re-ordering. The blob URLs are
 * kept for the lifetime of the page, with account-scoped blobs cached across reloads.
 */
const avatarCache = new Map<string, string>()
const avatarRequests = new Map<string, Promise<string>>()

/**
 * A long chat list mounts every row at once. Matrix media goes through the
 * gateway, so cap in-flight avatar requests and let the rest queue up rather
 * than firing one request per room in the same tick.
 */
const MAX_PARALLEL_AVATARS = 4
let activeAvatarRequests = 0
const avatarQueue: Array<() => void> = []

function acquireAvatarSlot() {
  if (activeAvatarRequests < MAX_PARALLEL_AVATARS) {
    activeAvatarRequests++
    return Promise.resolve()
  }
  return new Promise<void>(resolve => { avatarQueue.push(resolve) })
}

function releaseAvatarSlot() {
  const next = avatarQueue.shift()
  // Hand the slot over instead of dropping it, so the cap stays exact.
  if (next) next()
  else activeAvatarRequests--
}

function loadAvatar(store: { avatarBlob(mxcUrl: string): Promise<Blob> }, scope: string, mxcUrl: string): Promise<string> {
  const cacheKey = JSON.stringify([scope, mxcUrl])
  const cached = avatarCache.get(cacheKey)
  if (cached) return Promise.resolve(cached)
  const pending = avatarRequests.get(cacheKey)
  if (pending) return pending
  const tracked = acquireAvatarSlot()
    .then(() => cachedAvatarBlob(scope, mxcUrl, () => store.avatarBlob(mxcUrl)))
    .then(blob => {
      const url = URL.createObjectURL(blob)
      avatarCache.set(cacheKey, url)
      return url
    })
    .finally(() => {
      releaseAvatarSlot()
      avatarRequests.delete(cacheKey)
    })
  avatarRequests.set(cacheKey, tracked)
  return tracked
}

/**
 * Peer or room avatar with an optional presence dot, fed by `rooms[].avatarUrl`
 * (`rooms[].peer.avatarUrl` for direct chats) in the snapshot. The image is a
 * Matrix `mxc://` URI, so it is loaded as a blob through the store (gateway
 * media route) exactly like an attachment.
 */
export function MessengerPeerAvatar({ name, mxcUrl, presence = 'unknown', size = 'md', rounded = 'full', showPresence = true, fallback }: {
  name: string
  mxcUrl?: string
  presence?: MessengerPresence
  /** Chat list and message rows use `md`; larger surfaces can opt into `lg`. */
  size?: keyof typeof SIZE
  /** Channels and team hubs use squared corners. */
  rounded?: 'full' | 'lg'
  showPresence?: boolean
  /** Overrides the initials, e.g. `#` for a channel without an avatar. */
  fallback?: string
}) {
  const { store, snapshot } = useMessenger()
  const scope = snapshot.session ? JSON.stringify([getApiUrl(), snapshot.session.homeserver, snapshot.session.userId]) : undefined
  const cacheKey = scope && mxcUrl ? JSON.stringify([scope, mxcUrl]) : undefined
  const [loaded, setLoaded] = useState<{ key: string; url: string }>()
  const url = cacheKey ? (loaded?.key === cacheKey ? loaded.url : avatarCache.get(cacheKey)) : undefined
  useEffect(() => {
    if (!mxcUrl || !scope || !cacheKey || avatarCache.has(cacheKey)) return
    let cancelled = false
    void loadAvatar(store, scope, mxcUrl).then(next => {
      if (!cancelled) setLoaded({ key: cacheKey, url: next })
    }).catch(() => {}) // A missing avatar is cosmetic; the initials stay.
    return () => { cancelled = true }
  }, [store, scope, mxcUrl, cacheKey])
  const roundClass = rounded === 'lg' ? 'rounded-lg' : 'rounded-full'
  const withPresence = showPresence && presence !== 'unknown'
  return <span
    data-presence={presence}
    aria-hidden
    className={'relative flex shrink-0 select-none items-center justify-center bg-primary/10 font-semibold text-primary ' + SIZE[size] + ' ' + roundClass}
  >
    {url
      ? <img src={url} alt="" className={'h-full w-full object-cover ' + roundClass} />
      : <span className="truncate px-1">{fallback ?? initials(name)}</span>}
    {withPresence && <TooltipHint content={presence === 'online' ? 'Online' : presence === 'unavailable' ? 'Away' : 'Offline'}><span
      data-presence-dot={presence}
      className={'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ' + DOT[presence]}
    /></TooltipHint>}
  </span>
}
