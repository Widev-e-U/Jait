import { EventEmitter } from 'node:events'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { MessengerStore } from './store'
import { sessionKey, type MessengerSession } from './model'

const mock = vi.hoisted(() => ({ createClient: vi.fn(), notify: vi.fn(), revoke: vi.fn(), failCrypto: false }))
vi.mock('@/lib/system-notifications', () => ({ triggerSystemNotification: mock.notify, revokeSystemNotification: mock.revoke }))
vi.mock('./crypto', () => ({ initializeCrypto: (client: Client) => client.initRustCrypto() }))
vi.mock('matrix-js-sdk', () => ({
  Direction: { Backward: 'b', Forward: 'f' },
  createClient: mock.createClient,
  ClientEvent: { Sync: 'sync', Room: 'Room' },
  SyncState: { Prepared: 'PREPARED', Syncing: 'SYNCING', Error: 'ERROR', Reconnecting: 'RECONNECTING' },
  RoomEvent: { Timeline: 'timeline', Name: 'name', MyMembership: 'membership', Receipt: 'receipt', LocalEchoUpdated: 'echo', AccountData: 'accountData' },
  MatrixEventEvent: { Decrypted: 'decrypted' },
  EventType: { MarkedUnread: 'm.marked_unread' },
  NotificationCountType: { Total: 'total', Highlight: 'highlight' },
  Preset: { TrustedPrivateChat: 'trusted_private_chat' },
}))

class Client extends EventEmitter {
  login = vi.fn(async () => ({ user_id: '@alice:matrix.test', device_id: 'A', access_token: 'private-token' }))
  whoami = vi.fn(async () => ({ user_id: '@alice:matrix.test', device_id: 'A' }))
  initRustCrypto = vi.fn(async () => { if (mock.failCrypto) throw new Error('private-token') })
  startClient = vi.fn(async () => { this.emit('sync', 'PREPARED'); this.emit('sync', 'SYNCING') })
  stopClient = vi.fn()
  logout = vi.fn(async () => ({}))
  getRooms = vi.fn(() => [])
  getRoom = vi.fn(() => null)
  sendTextMessage = vi.fn(async () => ({}))
  scrollback = vi.fn(async () => ({}))
  createRoom = vi.fn(async () => ({ room_id: '!new:matrix.test' }))
  getPushActionsForEvent = vi.fn(() => ({ notify: true }))
  setRoomAccountData = vi.fn(async (_roomId: string, _type: string, _content: { unread: boolean }) => ({}))
  setRoomReadMarkers = vi.fn(async (_roomId: string, _eventId: string, _event: unknown) => ({}))
  mxcUrlToHttp = vi.fn(() => 'https://matrix.test/_matrix/client/v1/media/download/matrix.test/file')
}

function storage() {
  const values = new Map<string, string>()
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) }, removeItem: (k: string) => { values.delete(k) }, clear: () => values.clear(), key: () => null, get length() { return values.size } } satisfies Storage
}

const session: MessengerSession = { homeserver: 'https://matrix.test', userId: '@alice:matrix.test', deviceId: 'A', accessToken: 'private-token', cryptoStore: 'isolated-keys' }
let clients: Client[]
let stores: MessengerStore[]
const makeStore = () => {
  const data = storage()
  const store = new MessengerStore('gateway|alice', data)
  stores.push(store)
  return { store, data }
}

beforeEach(() => {
  vi.clearAllMocks()
  clients = []
  stores = []
  mock.failCrypto = false
  mock.notify.mockResolvedValue(undefined)
  mock.revoke.mockResolvedValue(undefined)
  mock.createClient.mockImplementation(() => { const client = new Client(); clients.push(client); return client })
  vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, _opts, callback) => callback({})) } })
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false })
})
afterEach(() => { stores.forEach(store => store.dispose()); vi.unstubAllGlobals() })

const input = { homeserver: 'https://matrix.test', username: 'alice', password: 'private-password' }

describe('personal Matrix client lifecycle', () => {
  it('initializes crypto before sync, stores no password, and revokes on disconnect', async () => {
    const { store, data } = makeStore()
    await store.connect(input)
    const client = clients.at(-1)!
    expect(client.initRustCrypto.mock.invocationCallOrder[0]).toBeLessThan(client.startClient.mock.invocationCallOrder[0])
    expect(store.getSnapshot().status).toBe('ready')
    expect(data.getItem(sessionKey('gateway|alice'))).not.toContain('private-password')
    expect(JSON.stringify(store.getSnapshot())).not.toContain('private-token')
    await store.disconnect()
    expect(client.stopClient).toHaveBeenCalled()
    expect(client.logout).toHaveBeenCalled()
    expect(data.length).toBe(0)
    expect(store.getSnapshot().messages).toEqual([])
  })

  it('fails closed when encryption initialization fails', async () => {
    const { store, data } = makeStore()
    mock.failCrypto = true
    await store.connect(input)
    expect(store.getSnapshot().status).toBe('error')
    expect(clients.at(-1)!.startClient).not.toHaveBeenCalled()
    expect(clients[0].logout).toHaveBeenCalled()
    expect(data.length).toBe(0)
    expect(store.getSnapshot().error).not.toContain('private-token')
    await expect(store.send('room', 'hello')).rejects.toThrow()
  })

  it('cancels an in-flight login and revokes the newly issued device', async () => {
    const { store, data } = makeStore()
    let finish: (() => void) | undefined
    const client = new Client()
    client.login.mockImplementation(async () => { await new Promise<void>(resolve => { finish = resolve }); return { user_id: session.userId, device_id: 'A', access_token: 'private-token' } })
    mock.createClient.mockReturnValueOnce(client)
    const connection = store.connect(input)
    await vi.waitFor(() => expect(finish).toBeDefined())
    store.dispose()
    finish!()
    await connection
    expect(client.logout).toHaveBeenCalled()
    expect(client.startClient).not.toHaveBeenCalled()
    expect(data.length).toBe(0)
    expect(store.getSnapshot().status).toBe('disconnected')
  })

  it('blocks reuse of a crypto store already held by another tab', async () => {
    const { store, data } = makeStore()
    data.setItem(sessionKey('gateway|alice'), JSON.stringify(session))
    vi.stubGlobal('navigator', { locks: { request: (_name: string, _opts: unknown, callback: (lock: null) => Promise<void>) => callback(null) } })
    await expect(store.resume()).rejects.toThrow('another tab')
    expect(store.getSnapshot().error).toContain('another tab')
    expect(mock.createClient).not.toHaveBeenCalled()
  })

  it('rejects stored sessions whose token resolves to a different identity', async () => {
    const { store, data } = makeStore()
    data.setItem(sessionKey('gateway|alice'), JSON.stringify(session))
    const client = new Client()
    client.whoami.mockResolvedValue({ user_id: '@bob:matrix.test', device_id: 'B' })
    mock.createClient.mockReturnValueOnce(client)
    await expect(store.resume()).rejects.toThrow('Session identity mismatch')
    expect(client.initRustCrypto).not.toHaveBeenCalled()
    expect(store.getSnapshot().status).toBe('error')
  })

  it('never makes credential requests for insecure homeserver addresses', async () => {
    const { store } = makeStore()
    await store.connect({ ...input, homeserver: 'http://192.168.1.1' })
    expect(mock.createClient).not.toHaveBeenCalled()
    expect(store.getSnapshot().error).toContain('Use HTTPS')
  })

  it('blocks token-bearing media requests to event-controlled servers', async () => {
    const { store } = makeStore()
    await store.connect(input)
    clients.at(-1)!.mxcUrlToHttp.mockReturnValue('https://attacker.test/file')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(store.attachmentBlob({ url: 'mxc://attacker.test/file', mime: 'image/png', name: 'QR', image: true })).rejects.toThrow('Invalid attachment URL')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches media with authenticated headers, rejects redirects and caps streamed data', async () => {
    const { store } = makeStore()
    await store.connect(input)
    const fetch = vi.fn(async () => new Response(new Uint8Array(21 * 1024 * 1024)))
    vi.stubGlobal('fetch', fetch)
    await expect(store.attachmentBlob({ url: 'mxc://matrix.test/file', mime: 'image/png', name: 'QR', image: true })).rejects.toThrow('20 MB')
    expect(fetch).toHaveBeenCalledWith('https://matrix.test/_matrix/client/v1/media/download/matrix.test/file', expect.objectContaining({ redirect: 'error', headers: { Authorization: 'Bearer private-token' } }))
  })


  it('creates encrypted direct conversations only for complete Matrix IDs', async () => {
    const { store } = makeStore()
    await store.connect(input)
    const client = clients.at(-1)!
    await expect(store.openDirect('https://attacker.test')).rejects.toThrow('Matrix user ID')
    expect(client.createRoom).not.toHaveBeenCalled()
    await expect(store.openDirect('@whatsappbot:matrix.test')).resolves.toBe('!new:matrix.test')
    expect(client.createRoom).toHaveBeenCalledWith(expect.objectContaining({
      invite: ['@whatsappbot:matrix.test'],
      initial_state: [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }],
    }))
  })

  it('does not notify about decrypted backlog and deduplicates live events', async () => {
    const { store } = makeStore()
    await store.connect(input)
    await store.enableNotifications(true)
    const client = clients.at(-1)!
    const room = { name: 'Personal', roomId: '!room:matrix.test', getMember: () => ({ name: 'Bob' }), getJoinedMemberCount: () => 2, getLiveTimeline: () => ({ getEvents: () => [], getPaginationToken: () => null }) }
    const event = {
      getId: () => '$message', getRoomId: () => room.roomId, getType: () => 'm.room.message',
      isDecryptionFailure: () => false, getSender: () => '@bob:matrix.test', status: null,
    }
    client.getRoom.mockReturnValue(room as never)
    client.emit('decrypted', event)
    expect(mock.notify).not.toHaveBeenCalled()
    client.emit('timeline', event, room, false, false, { liveEvent: true })
    client.emit('decrypted', event)
    expect(mock.notify).toHaveBeenCalledTimes(1)
    expect(mock.notify.mock.calls[0][0]).toMatchObject({ body: 'New message', link: '/messenger?roomId=!room%3Amatrix.test' })
  })
})

function readRoom(client: Client) {
  const events = ['$old', '$new'].map((id, index) => ({
    getId: () => id, getSender: () => '@bob:matrix.test', status: null,
    getTs: () => 1700000000000 + index, getType: () => 'm.room.message',
    getContent: () => ({ body: id }), isRedacted: () => false, isEncrypted: () => false,
    isDecryptionFailure: () => false,
  }))
  const accountData = new Map<string, unknown>()
  const room = {
    roomId: '!room:matrix.test', name: 'Personal',
    getMyMembership: () => 'join', getMember: () => ({ name: 'Bob', getMxcAvatarUrl: () => 'mxc://matrix.test/bob' }), getMembers: () => [],
    getLiveTimeline: () => ({ getEvents: () => events, getPaginationToken: () => null }),
    findEventById: (id: string) => events.find(event => event.getId() === id),
    getUnfilteredTimelineSet: () => ({ compareEventOrdering: (a: string, b: string) => events.findIndex(event => event.getId() === a) - events.findIndex(event => event.getId() === b) }),
    getReadReceiptForUserId: vi.fn(() => null as unknown),
    hasUserReadEvent: vi.fn(() => false),
    getAccountData: (type: string) => ({ getContent: () => accountData.get(type) ?? {} }),
    currentState: { getStateEvents: (_type: string, key?: string) => key === undefined ? [] : null },
    getUnreadNotificationCount: () => 2, setUnread: vi.fn(),
  }
  client.getRoom.mockImplementation((id?: string) => id === room.roomId ? room as never : null)
  client.getRooms.mockReturnValue([room] as never)
  return { room, events, accountData }
}

describe('explicit assistant access', () => {
  it('requires opt-in, validates input, and resets access on disconnect', async () => {
    const { store } = makeStore(); await store.connect(input)
    const client = clients.at(-1)!; const { room } = readRoom(client)
    const command = { action: 'send', roomId: room.roomId, text: 'literal **message**' }
    const expiry = () => Date.now() + 10000
    expect((await store.assistantCommand(command, expiry())).ok).toBe(false)
    expect(client.sendTextMessage).not.toHaveBeenCalled()
    store.setAssistantAccess(true)
    expect((await store.assistantCommand({ ...command, roomId: '!other:test' }, expiry())).ok).toBe(false)
    expect((await store.assistantCommand(command, Date.now() - 1)).ok).toBe(false)
    expect((await store.assistantCommand({ ...command, text: ' ' }, expiry())).ok).toBe(false)
    expect((await store.assistantCommand(command, expiry())).ok).toBe(true)
    expect(client.sendTextMessage).toHaveBeenCalledExactlyOnceWith(room.roomId, 'literal **message**')
    await store.disconnect()
    expect(store.getSnapshot().assistantAccess).toBe(false)
  })

  it('searches decrypted loaded history without receipts, selection changes, or attachment keys', async () => {
    const { store } = makeStore(); await store.connect(input)
    const client = clients.at(-1)!; const { room, events } = readRoom(client)
    events[0]!.getContent = () => ({ body: 'hello firewall', file: { url: 'mxc://test/file', key: { k: 'secret-attachment-key' } } } as never)
    events[1]!.getContent = () => ({ body: 'firewall is encrypted' })
    events[1]!.isDecryptionFailure = () => true
    store.setAssistantAccess(true)
    const result = await store.assistantCommand({ action: 'search', query: 'FIREWALL' }, Date.now() + 10000)
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ messages: [{ id: '$old', roomId: room.roomId, body: 'hello firewall' }], coverage: { undecryptable: 1 } })
    expect(JSON.stringify(result)).not.toContain('secret-attachment-key')
    expect(JSON.stringify(result)).not.toContain('private-token')
    expect(client.setRoomReadMarkers).not.toHaveBeenCalled()
    expect(store.getSnapshot().selectedRoomId).toBeNull()
    const status = await store.assistantCommand({ action: 'status' }, Date.now() + 10000)
    expect(JSON.stringify(status)).not.toContain('private-token')
  })

  it('loads only the requested history page and rechecks opt-in after asynchronous loading', async () => {
    const { store } = makeStore(); await store.connect(input)
    const client = clients.at(-1)!; const { room } = readRoom(client)
    store.setAssistantAccess(true)
    client.scrollback.mockImplementationOnce(async () => { store.setAssistantAccess(false); return {} })
    const result = await store.assistantCommand({ action: 'messages', roomId: room.roomId, earlier: true }, Date.now() + 10000)
    expect(result.ok).toBe(false)
    expect(result.data).toBeUndefined()
    expect(client.scrollback).toHaveBeenCalledExactlyOnceWith(room, 40)
  })
})

describe('read and unread controls', () => {
  it('marks a non-selected conversation read, persists its flag, and clears its counts', async () => {
    const { store } = makeStore(); await store.connect(input)
    const client = clients.at(-1)!; const { room, events } = readRoom(client)
    await store.markRead(room.roomId)
    expect(client.setRoomReadMarkers).toHaveBeenCalledWith(room.roomId, '$new', events[1])
    expect(client.setRoomAccountData).toHaveBeenCalledWith(room.roomId, 'm.marked_unread', { unread: false })
    expect(room.setUnread).toHaveBeenCalledWith('total', 0)
    expect(store.getSnapshot().selectedRoomId).toBeNull()
  })
  it('does not mark newer messages read through an old notification or regress a newer real receipt', async () => {
    const { store } = makeStore(); await store.connect(input)
    const client = clients.at(-1)!; const { room, events } = readRoom(client)
    await store.markRead(room.roomId, '$old')
    expect(client.setRoomReadMarkers).toHaveBeenCalledWith(room.roomId, '$old', events[0])
    expect(room.setUnread).not.toHaveBeenCalled()
    client.setRoomReadMarkers.mockClear()
    room.getReadReceiptForUserId.mockReturnValue({ eventId: '$new', data: { ts: 1700000000001 } })
    await store.markRead(room.roomId, '$old')
    expect(client.setRoomReadMarkers).not.toHaveBeenCalled()
  })
  it('serializes read/unread, preserves the manual unread mark through automatic reads, and accepts remote sync', async () => {
    const { store } = makeStore(); await store.connect(input)
    const client = clients.at(-1)!; const { room, accountData } = readRoom(client)
    let finish: () => void = () => {}
    client.setRoomReadMarkers.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve }); return {} })
    const reading = store.markRead(room.roomId)
    await vi.waitFor(() => expect(client.setRoomReadMarkers).toHaveBeenCalledOnce())
    const unread = store.markUnread(room.roomId)
    finish(); await reading; await unread
    await store.markRead(room.roomId, undefined, true)
    expect(client.setRoomAccountData.mock.calls.map(call => call[2])).toEqual([{ unread: false }, { unread: true }])
    expect(store.getSnapshot().rooms[0]?.markedUnread).toBe(true)
    accountData.set('m.marked_unread', { unread: true })
    client.emit('accountData', { getType: () => 'm.marked_unread', getContent: () => ({ unread: true }) }, room)
    accountData.set('m.marked_unread', { unread: false })
    client.emit('accountData', { getType: () => 'm.marked_unread', getContent: () => ({ unread: false }) }, room)
    expect(store.getSnapshot().rooms[0]?.markedUnread).toBe(false)
  })
  it('does not claim a failed manual write succeeded', async () => {
    const { store } = makeStore(); await store.connect(input)
    const client = clients.at(-1)!; const { room } = readRoom(client)
    client.setRoomAccountData.mockRejectedValueOnce(new Error('offline'))
    await expect(store.markUnread(room.roomId)).rejects.toThrow('offline')
    expect(store.getSnapshot().rooms[0]?.markedUnread).not.toBe(true)
  })
  it('cancels pending read operations when the authenticated store is disposed', async () => {
    const { store } = makeStore(); await store.connect(input)
    const client = clients.at(-1)!; const { room } = readRoom(client)
    const read = store.markRead(room.roomId)
    store.dispose()
    await expect(read).rejects.toThrow('Cancelled')
    expect(client.setRoomReadMarkers).not.toHaveBeenCalled()
  })
})
