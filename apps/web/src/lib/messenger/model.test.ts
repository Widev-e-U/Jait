import { describe, expect, it } from 'vitest'
import { bridgeLabel, isStatusRoom, messengerError, normalizeHomeserver, presenceLabel, readSession, roomKind, sessionKey, uniqueReaders } from './model'

describe('Matrix account boundaries', () => {
  it('accepts HTTPS and loopback HTTP and rejects secret-bearing or unsafe URLs', () => {
    expect(normalizeHomeserver(' https://matrix.example.com/ ')).toBe('https://matrix.example.com')
    expect(normalizeHomeserver('http://localhost:8008/')).toBe('http://localhost:8008')
    expect(normalizeHomeserver('http://[::1]:8008')).toBe('http://[::1]:8008')
    for (const url of ['http://192.168.1.1', 'javascript:alert(1)', 'https://me:secret@example.com', 'https://example.com/?token=secret', 'https://example.com/#token']) {
      expect(() => normalizeHomeserver(url)).toThrow()
    }
  })
  it('isolates sessions by gateway and user and drops corrupt stored credentials', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key) } }
    const owner = 'gateway-a|alice'
    values.set(sessionKey(owner), JSON.stringify({ homeserver: 'https://matrix.example.com', userId: '@alice:matrix.example.com', deviceId: 'A', accessToken: 'private-token', cryptoStore: 'a' }))
    expect(readSession(storage, owner)?.deviceId).toBe('A')
    expect(readSession(storage, 'gateway-a|bob')).toBeNull()
    expect(readSession(storage, 'gateway-b|alice')).toBeNull()
    values.set(sessionKey(owner), '{"accessToken":"private-token"}')
    expect(readSession(storage, owner)).toBeNull()
    expect(values.has(sessionKey(owner))).toBe(false)
  })
  it('never surfaces raw homeserver errors or credentials', () => {
    expect(messengerError({ errcode: 'M_FORBIDDEN', message: 'private-token' })).not.toContain('private-token')
    expect(messengerError(new Error('https://server/?token=private-token'))).not.toContain('private-token')
  })
  it('uses explicit bridge metadata rather than guessing service from room names', () => {
    expect(bridgeLabel(undefined)).toEqual({ service: 'Matrix', network: '' })
    expect(bridgeLabel({ protocol: { id: 'whatsapp' }, network: { displayname: 'Personal' } })).toEqual({ service: 'WhatsApp', network: 'Personal' })
    expect(bridgeLabel({ protocol: { id: 'msteams' }, network: { displayname: 'Tenant A' } })).toEqual({ service: 'Teams', network: 'Tenant A' })
  })
  it('recognizes WhatsApp status broadcast rooms by name or topic only', () => {
    expect(isStatusRoom({ name: 'WhatsApp Status Broadcast' })).toBe(true)
    expect(isStatusRoom({ name: 'WhatsApp status broadcast' })).toBe(true)
    expect(isStatusRoom({ name: 'Someone', topic: 'Status updates from your contacts' })).toBe(true)
    expect(isStatusRoom({ name: 'Bob', topic: '' })).toBe(false)
    expect(isStatusRoom({ name: 'Status meeting', topic: 'weekly sync' })).toBe(false)
    expect(isStatusRoom({})).toBe(false)
    expect(isStatusRoom({ name: null, topic: null })).toBe(false)
  })
  it('classifies teams, channels, and plain chats without hiding unknown rooms', () => {
    // Status wins over every other shape.
    expect(roomKind({ name: 'WhatsApp Status Broadcast', service: 'WhatsApp', space: true })).toBe('status')
    expect(roomKind({ status: true, space: true })).toBe('status')
    // Matrix spaces are team hubs.
    expect(roomKind({ space: true, service: 'Teams', name: 'Engineering' })).toBe('team')
    // Bridge channels on team platforms are channels; direct messages stay chats.
    expect(roomKind({ service: 'Slack', name: 'general', channel: { is_direct: false }, team: 'Acme' })).toBe('channel')
    expect(roomKind({ service: 'Slack', name: 'Bob', channel: { isDirect: true } })).toBe('chat')
    // Rooms hung on a team space are channels even without bridge metadata.
    expect(roomKind({ service: 'Matrix', name: 'standup', team: 'Engineering' })).toBe('channel')
    // Group chats on personal messengers are chats, not team channels.
    expect(roomKind({ service: 'WhatsApp', name: 'Family', channel: { is_direct: false } })).toBe('chat')
    // Unknown shapes stay plain chats so nothing disappears.
    expect(roomKind({ service: 'Matrix', name: 'Bob' })).toBe('chat')
    expect(roomKind({})).toBe('chat')
  })
})

describe('Peer presence labels', () => {
  it('names online, away, and offline states', () => {
    expect(presenceLabel('online')).toBe('Online')
    expect(presenceLabel('unavailable')).toBe('Away')
    expect(presenceLabel('offline')).toBe('Offline')
  })
  it('stays silent when the homeserver has no presence for the peer', () => {
    expect(presenceLabel(undefined)).toBe('')
    expect(presenceLabel('unknown')).toBe('')
  })
  it('adds a last-seen age only for finite non-negative offline ages', () => {
    expect(presenceLabel('offline', 30_000)).toBe('Last seen just now')
    expect(presenceLabel('offline', 12 * 60_000)).toBe('Last seen 12 min ago')
    expect(presenceLabel('offline', 5 * 3_600_000)).toBe('Last seen 5 h ago')
    expect(presenceLabel('offline', 3 * 86_400_000)).toBe('Last seen 3 d ago')
    expect(presenceLabel('offline', Number.NaN)).toBe('Offline')
    expect(presenceLabel('offline', -1)).toBe('Offline')
    expect(presenceLabel('online', 5 * 86_400_000)).toBe('Online')
  })
})

describe('Read receipt rendering', () => {
  it('lists a reader once even when they acknowledged several messages', () => {
    const readers = [
      { userId: '@bob:test', name: 'Bob', timestamp: 1_700_000_000_000, exact: false },
      { userId: '@bob:test', name: 'Bob', timestamp: 1_700_000_900_000, exact: true },
      { userId: '@bob:test', name: 'Bob', timestamp: 1_700_000_500_000, exact: false },
    ]
    expect(uniqueReaders(readers)).toEqual([
      { userId: '@bob:test', name: 'Bob', timestamp: 1_700_000_900_000, exact: true },
    ])
  })
  it('keeps distinct readers in order and tolerates missing timestamps', () => {
    const deduped = uniqueReaders([
      { userId: '@bob:test', name: 'Bob', timestamp: null, exact: false },
      { userId: '@carol:test', name: 'Carol', timestamp: 1_700_000_000_000, exact: true },
      { userId: '@bob:test', name: 'Bob', timestamp: null, exact: false },
    ])
    expect(deduped).toEqual([
      { userId: '@bob:test', name: 'Bob', timestamp: null, exact: false },
      { userId: '@carol:test', name: 'Carol', timestamp: 1_700_000_000_000, exact: true },
    ])
  })
})


it('recognizes the deployed mautrix Teams protocol ID', () => {
  expect(bridgeLabel({ protocol: { id: 'go.mau.fi/mautrix-teams', displayname: 'Microsoft Teams' } }))
    .toEqual({ service: 'Teams', network: '' })
})
