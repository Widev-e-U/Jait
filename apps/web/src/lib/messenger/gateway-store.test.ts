import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessengerMessage, MessengerSnapshot } from './model'

vi.mock('@/lib/gateway-url', () => ({ getApiUrl: () => 'http://gateway.test:8000' }))
vi.mock('@/lib/auth-token', () => ({ getAuthToken: () => 'token' }))
vi.mock('@/lib/system-notifications', () => ({ triggerSystemNotification: vi.fn(async () => {}) }))

const { GatewayMessengerStore } = await import('./gateway-store')
const { triggerSystemNotification } = await import('@/lib/system-notifications')

const ROOM_ID = '!room:test'

function message(overrides: Partial<MessengerMessage> = {}): MessengerMessage {
  return {
    id: '$old',
    sender: '@them:test',
    body: 'earlier',
    timestamp: 1_000,
    own: false,
    encrypted: false,
    unableToDecrypt: false,
    pending: false,
    failed: false,
    ...overrides,
  }
}

function snapshot(messages: MessengerMessage[]): MessengerSnapshot {
  return {
    status: 'ready',
    error: null,
    session: { homeserver: 'https://matrix.test', userId: '@me:test', deviceId: 'DEVICE' },
    rooms: [{ id: ROOM_ID, name: 'Room', service: 'Matrix', network: 'Matrix', unread: 0, membership: 'join', encrypted: false, timestamp: 1_000, preview: 'earlier' }],
    messages,
    selectedRoomId: ROOM_ID,
    notifications: false,
    assistantAccess: false,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type Send = { url: string; body: Record<string, unknown> | undefined }

/** Serves the gateway API from an in-memory timeline so sends land in the next poll. */
function installGateway(initial: MessengerMessage[]) {
  const timeline = [...initial]
  const sends: Send[] = []
  let held: Array<(response: Response) => void> = []
  let holdSends = false
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    sends.push({ url: String(input), body })
    if (body?.action === 'send') {
      if (holdSends) return new Promise<Response>(resolve => held.push(resolve))
      timeline.push(message({ id: '$sent', body: String(body.text), timestamp: 2_000, own: true, sender: '@me:test' }))
      return json({ ok: true, eventId: '$sent' })
    }
    return json({ snapshot: snapshot(timeline) })
  }))
  return {
    sends,
    hold(next = true) { holdSends = next },
    release(response: Response) { held.shift()?.(response); held = held.slice(1) },
  }
}

async function openStore(initial: MessengerMessage[]) {
  const gateway = installGateway(initial)
  const store = new GatewayMessengerStore('owner')
  await store.resume()
  store.selectRoom(ROOM_ID)
  await vi.waitFor(() => expect(store.getSnapshot().messages.map(entry => entry.id)).toEqual(initial.map(entry => entry.id)))
  return { gateway, store }
}

beforeEach(() => { vi.unstubAllGlobals() })
afterEach(() => { vi.unstubAllGlobals() })

it('shows an outgoing message as pending before the gateway answers', async () => {
  const { gateway, store } = await openStore([message()])
  expect(store.getSnapshot().messages).toHaveLength(1)

  gateway.hold()
  const sending = store.send(ROOM_ID, 'hello there')

  const optimistic = store.getSnapshot().messages.at(-1)!
  expect(optimistic).toMatchObject({ body: 'hello there', own: true, pending: true, failed: false })
  expect(optimistic.id.startsWith('~local:')).toBe(true)
  expect(store.getSnapshot().messages).toHaveLength(2)

  gateway.release(json({ ok: true, eventId: '$sent' }))
  await sending

  const confirmed = store.getSnapshot().messages
  expect(confirmed.map(entry => entry.id)).toEqual(['$old', '$sent'])
  expect(confirmed.at(-1)).toMatchObject({ pending: false, body: 'hello there' })
})

it('reconciles the local echo with the polled event instead of duplicating it', async () => {
  const { gateway, store } = await openStore([message()])

  await store.send(ROOM_ID, 'hello there')
  await vi.waitFor(() => expect(store.getSnapshot().messages.map(entry => entry.id)).toEqual(['$old', '$sent']))
  expect(store.getSnapshot().messages.filter(entry => entry.body === 'hello there')).toHaveLength(1)
  expect(gateway.sends.some(send => send.body?.action === 'send')).toBe(true)
})

it('drops the local echo and reports the failure when sending fails', async () => {
  const { gateway, store } = await openStore([message()])

  gateway.hold()
  const sending = store.send(ROOM_ID, 'doomed')
  expect(store.getSnapshot().messages).toHaveLength(2)

  gateway.release(json({ error: 'nope' }, 500))
  await expect(sending).rejects.toThrow()
  expect(store.getSnapshot().messages.map(entry => entry.id)).toEqual(['$old'])
})

it('decodes a Matrix avatar through the gateway media route', async () => {
  const { gateway, store } = await openStore([message()])
  const calls: Send[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    calls.push({ url: String(input), body })
    if (String(input).endsWith('/api/messenger/media')) return json({ data: btoa('avatar-bytes') })
    return json({ snapshot: snapshot([message()]) })
  }))

  const blob = await store.avatarBlob('mxc://matrix.test/avatar')

  expect(await blob.text()).toBe('avatar-bytes')
  expect(calls).toEqual([{ url: 'http://gateway.test:8000/api/messenger/media', body: { url: 'mxc://matrix.test/avatar' } }])
  expect(gateway.sends.some(send => send.url.endsWith('/media'))).toBe(false)
})

it('never uses a local echo id when marking the room read', async () => {
  const { gateway, store } = await openStore([message()])

  gateway.hold()
  const sending = store.send(ROOM_ID, 'hello')
  await store.markRead(ROOM_ID)
  gateway.release(json({ ok: true, eventId: '$sent' }))
  await sending

  const reads = gateway.sends.filter(send => send.body?.action === 'read')
  expect(reads.length).toBeGreaterThan(0)
  expect(reads.every(read => !String(read.body?.eventId ?? '').startsWith('~local:'))).toBe(true)
})

describe('gateway Messenger notifications', () => {
  let storage: Storage
  let browser: Window
  let remote: MessengerSnapshot
  let stores: InstanceType<typeof GatewayMessengerStore>[]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(triggerSystemNotification).mockClear()
    const values = new Map<string, string>()
    storage = {
      get length() { return values.size },
      clear: () => values.clear(),
      getItem: key => values.get(key) ?? null,
      key: index => [...values.keys()][index] ?? null,
      removeItem: key => { values.delete(key) },
      setItem: (key, value) => { values.set(key, String(value)) },
    }
    browser = Object.assign(new EventTarget(), { localStorage: storage }) as unknown as Window
    vi.stubGlobal('window', browser)
    vi.stubGlobal('document', { visibilityState: 'visible', hasFocus: () => true })
    remote = snapshot([])
    stores = []
    vi.stubGlobal('fetch', vi.fn(async () => json({ snapshot: remote })))
  })

  afterEach(() => {
    stores.forEach(store => store.dispose())
    vi.useRealTimers()
  })

  async function start(owner = 'owner') {
    const store = new GatewayMessengerStore(owner)
    stores.push(store)
    await store.resume()
    return store
  }

  async function poll() {
    await vi.advanceTimersByTimeAsync(2_000)
  }

  it('persists the preference per account and restores it without notifying about old unread messages', async () => {
    const first = await start()
    await first.enableNotifications(true)
    first.dispose()
    remote = { ...remote, rooms: [{ ...remote.rooms[0]!, unread: 2 }] }
    const restored = await start()
    expect(restored.getSnapshot().notifications).toBe(true)
    expect(triggerSystemNotification).not.toHaveBeenCalled()

    restored.dispose()
    remote = { ...remote, session: { ...remote.session!, userId: '@other:test' } }
    const other = await start()
    expect(other.getSnapshot().notifications).toBe(false)

    remote = snapshot([])
    const otherOwner = await start('different-jait-user')
    expect(otherOwner.getSnapshot().notifications).toBe(false)
  })

  it('leaves notifications disabled when browser permission is denied', async () => {
    const notification = { requestPermission: vi.fn(async () => 'denied') }
    Object.assign(browser, { Notification: notification })
    vi.stubGlobal('Notification', notification)
    const store = await start()

    await expect(store.enableNotifications(true)).rejects.toThrow('Allow notifications')
    expect(store.getSnapshot().notifications).toBe(false)
    expect(storage.length).toBe(0)
  })

  it('honors preference changes in another tab', async () => {
    const store = await start()
    await store.enableNotifications(true)
    const key = storage.key(0)!
    storage.setItem(key, '0')
    const event = new Event('storage')
    Object.defineProperties(event, {
      storageArea: { value: storage },
      key: { value: key },
      newValue: { value: '0' },
    })
    browser.dispatchEvent(event)
    expect(store.getSnapshot().notifications).toBe(false)
  })

  it('notifies for a new unread conversation, and suppresses a focused conversation', async () => {
    const store = await start()
    await store.enableNotifications(true)
    remote = {
      ...remote,
      rooms: [
        ...remote.rooms,
        { ...remote.rooms[0]!, id: '!new:test', name: 'New conversation', timestamp: 2_000, unread: 1 },
      ],
    }
    await poll()
    expect(triggerSystemNotification).toHaveBeenCalledTimes(1)
    expect(triggerSystemNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: 'New conversation',
      independentOfAttention: true,
      link: '/messenger?roomId=!new%3Atest',
    }))

    store.setVisibleRoom(ROOM_ID)
    remote = { ...remote, rooms: remote.rooms.map(room => room.id === ROOM_ID ? { ...room, timestamp: 3_000, unread: 1 } : room) }
    await poll()
    expect(triggerSystemNotification).toHaveBeenCalledTimes(1)
  })

  it('detects unread messages received while the gateway was reconnecting', async () => {
    const store = await start()
    await store.enableNotifications(true)
    remote = { ...remote, status: 'reconnecting' }
    await poll()
    remote = { ...remote, status: 'ready', rooms: remote.rooms.map(room => ({ ...room, timestamp: 2_000, unread: 1 })) }
    await poll()
    expect(triggerSystemNotification).toHaveBeenCalledTimes(1)
  })
})
