export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

import type { MessengerSession, MessengerPresence, MessengerReadReceipt, MessengerRoomKind } from '@jait/shared'
export type { MessengerSession, MessengerMessage, MessengerPresence, MessengerRoom, MessengerRoomKind, MessengerRoomPeer, MessengerSnapshot, MessengerReadReceipt } from '@jait/shared'

export function normalizeHomeserver(input: string): string {
  const url = new URL(input.trim())
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Use HTTPS for your homeserver, or HTTP on localhost.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Enter a homeserver URL without credentials, query parameters, or fragments.')
  }
  return url.href.replace(/\/+$/, '')
}

export function sessionKey(owner: string): string {
  return 'jait.messenger.session.' + encodeURIComponent(owner)
}

export function readSession(storage: Pick<Storage, 'getItem' | 'removeItem'>, owner: string): MessengerSession | null {
  const key = sessionKey(owner)
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null')
    if (!value) return null
    if (['homeserver', 'userId', 'deviceId', 'accessToken', 'cryptoStore'].some(k => typeof value[k] !== 'string' || !value[k])) {
      throw new Error('Invalid session')
    }
    value.homeserver = normalizeHomeserver(value.homeserver)
    return value as MessengerSession
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function messengerError(error: unknown): string {
  const code = (error as { errcode?: string })?.errcode
  if (code === 'M_FORBIDDEN') return 'Sign-in or access was denied. Check your credentials and server permissions.'
  if (code === 'M_UNKNOWN_TOKEN' || code === 'M_MISSING_TOKEN') return 'Your Matrix session expired. Disconnect and sign in again.'
  if (code === 'M_LIMIT_EXCEEDED') return 'Your homeserver is rate limiting requests. Wait a moment and try again.'
  // Server messages and request URLs can contain secrets. Do not surface raw SDK errors.
  return 'Matrix could not complete the request. Check the homeserver address, connection, and account permissions.'
}

/**
 * Bridged networks expose stories/statuses as one pseudo-chat. Mautrix names it
 * "WhatsApp Status Broadcast" and topics it "…status updates from your contacts".
 */
export function isStatusRoom(room: { name?: string | null; topic?: string | null }): boolean {
  const name = String(room?.name ?? '')
  const topic = String(room?.topic ?? '')
  return /status broadcast/i.test(name) || /status updates from your contacts/i.test(topic)
}

/** Services whose rooms are organized as teams/workspaces containing channels. */
export const TEAM_SERVICES = new Set(['Slack', 'Teams', 'Discord', 'Google Chat'])

/**
 * Team-platform rooms come in two structural shapes. A Matrix space holds the
 * team itself ("m.space" room type), while channel rooms are the conversations
 * inside a team — bridges flag them with a channel record that is not a direct
 * message. Everything unknown stays a plain chat so nothing is ever hidden.
 */
export function roomKind(input: {
  space?: boolean
  service?: string | null
  status?: boolean
  name?: string | null
  topic?: string | null
  channel?: { isDirect?: boolean; is_direct?: boolean } | null
  team?: string | null
}): MessengerRoomKind {
  if (input.status || isStatusRoom(input)) return 'status'
  if (input.space) return 'team'
  const direct = input.channel?.isDirect === true || input.channel?.is_direct === true
  const grouped = Boolean(input.channel) || Boolean(input.team)
  if (grouped && !direct && (input.team || TEAM_SERVICES.has(String(input.service ?? '')))) return 'channel'
  return 'chat'
}

export function bridgeLabel(content: Record<string, unknown> | undefined): { service: string; network: string } {
  const protocol = content?.protocol as { id?: unknown; displayname?: unknown } | undefined
  const network = content?.network as { displayname?: unknown } | undefined
  const raw = String(protocol?.id ?? '').toLowerCase()
  const known: Record<string, string> = {
    whatsapp: 'WhatsApp', telegram: 'Telegram', signal: 'Signal',
    'microsoft-teams': 'Teams', msteams: 'Teams', teams: 'Teams',
    'go.mau.fi/mautrix-teams': 'Teams',
    discord: 'Discord', slack: 'Slack', googlechat: 'Google Chat',
  }
  return {
    service: known[raw] ?? (typeof protocol?.displayname === 'string' ? protocol.displayname.slice(0, 80) : 'Matrix'),
    network: typeof network?.displayname === 'string' ? network.displayname.slice(0, 120) : '',
  }
}

/**
 * Header label for a peer's Matrix presence. Bridged contacts usually report
 * `unknown` — the homeserver keeps no presence for them — so callers fall back
 * to the room's service line instead of showing a state.
 */
export function presenceLabel(presence?: MessengerPresence, lastActiveAgo?: number): string {
  if (presence === 'online') return 'Online'
  if (presence === 'unavailable') return 'Away'
  if (presence !== 'offline') return ''
  if (typeof lastActiveAgo !== 'number' || !Number.isFinite(lastActiveAgo) || lastActiveAgo < 0) return 'Offline'
  const minutes = Math.floor(lastActiveAgo / 60_000)
  if (minutes < 1) return 'Last seen just now'
  if (minutes < 60) return `Last seen ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Last seen ${hours} h ago`
  return `Last seen ${Math.floor(hours / 24)} d ago`
}

/**
 * One row per person. Matrix stores receipts per event, so a reader can be
 * mentioned once per message they acknowledged; keep their furthest (latest)
 * receipt so the popover never lists the same account repeatedly.
 */
export function uniqueReaders(readers: MessengerReadReceipt[]): MessengerReadReceipt[] {
  const byUser = new Map<string, MessengerReadReceipt>()
  for (const reader of readers) {
    const current = byUser.get(reader.userId)
    if (!current) {
      byUser.set(reader.userId, reader)
      continue
    }
    const latest = (reader.timestamp ?? 0) >= (current.timestamp ?? 0) ? reader : current
    byUser.set(reader.userId, { ...latest, exact: current.exact || reader.exact })
  }
  return [...byUser.values()]
}
