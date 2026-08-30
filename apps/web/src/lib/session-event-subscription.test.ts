import { describe, expect, it } from 'vitest'

import {
  openSessionEventSubscription,
  type SessionEventSubscription,
} from '@/lib/session-event-subscription'

type FakeReply = {
  ok: boolean
  status: number
  body?: { getReader: () => ReadableStreamDefaultReader<Uint8Array> }
}

interface FakeConnection {
  reply: FakeReply
  push: (chunk: string) => void
  end: () => void
  abort: () => void
}

const encoder = new TextEncoder()

function makeConnection(status = 200): FakeConnection {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(ctl) { controller = ctl },
  })
  return {
    reply: {
      ok: status >= 200 && status < 300,
      status,
      body: { getReader: () => stream.getReader() },
    },
    push: (chunk) => { controller.enqueue(encoder.encode(chunk)) },
    end: () => { controller.close() },
    abort: () => { controller.error(new Error('stream error')) },
  }
}

/** Drains enough microtask turns for connect/reader/feed continuations to run. */
async function settle(turns = 10): Promise<void> {
  for (let i = 0; i < turns; i += 1) await Promise.resolve()
}

describe('session event subscription health', () => {
  it('reports connecting → open and tracks wire activity', async () => {
    let fakeNow = 1_000
    const connections: FakeConnection[] = []

    const subscription = openSessionEventSubscription({
      url: '/api/sessions/s1/events',
      onEvent: () => {},
      fetchImpl: (async () => {
        const connection = makeConnection()
        connections.push(connection)
        return connection.reply
      }) as unknown as typeof fetch,
      reconnectDelay: () => 100,
      scheduleRetry: (fn) => { void fn },
      now: () => fakeNow,
    })

    expect(subscription.getHealth().state).toBe('connecting')
    await settle()
    expect(connections.length).toBe(1)
    expect(subscription.getHealth()).toMatchObject({
      state: 'open',
      attempts: 0,
      lastOpenAt: 1_000,
      lastActivityAt: 1_000,
    })

    // Traffic on the wire refreshes the activity marker used by wake recovery.
    fakeNow = 2_000
    connections[0].push('id: 7\ndata: {"type":"token"}\n\n')
    await settle()
    expect(subscription.getHealth().lastActivityAt).toBe(2_000)
    expect(subscription.getLastEventId()).toBe('7')

    subscription.close()
  })

  it('a heartbeat keeps the wire fresh without advancing the resume id', async () => {
    let fakeNow = 1_000
    const connections: FakeConnection[] = []
    const events: Array<Record<string, unknown>> = []

    const subscription = openSessionEventSubscription({
      url: '/api/sessions/s1/events',
      onEvent: (event) => { events.push(event) },
      fetchImpl: (async () => {
        const connection = makeConnection()
        connections.push(connection)
        return connection.reply
      }) as unknown as typeof fetch,
      reconnectDelay: () => 100,
      scheduleRetry: (fn) => { void fn },
      now: () => fakeNow,
    })
    await settle()
    expect(subscription.getHealth()).toMatchObject({ state: 'open', attempts: 0 })

    // A gateway heartbeat (~15s later) refreshes activity but stays id-neutral.
    fakeNow = 16_000
    connections[0].push('data: {"type":"heartbeat"}\n\n')
    await settle()
    expect(subscription.getHealth().lastActivityAt).toBe(16_000)
    expect(subscription.getLastEventId()).toBe(null)

    // A real id-carrying event advances the resume position. (The heartbeat's
    // `data:` is valid JSON, so it passes through to onEvent too — consumers
    // ignore it by `type`.)
    connections[0].push('id: 42\ndata: {"type":"token"}\n\n')
    await settle()
    expect(events).toEqual([{ type: 'heartbeat' }, { type: 'token' }])
    expect(subscription.getLastEventId()).toBe('42')

    subscription.close()
    expect(subscription.getHealth().state).toBe('closed')
  })

  it('drops mid-stream go to retrying with fresh opens resetting attempts', async () => {
    const connections: FakeConnection[] = []
    const scheduled: Array<{ fn: () => void; delayMs: number }> = []

    const subscription = openSessionEventSubscription({
      url: '/api/sessions/s1/events',
      onEvent: () => {},
      fetchImpl: (async () => {
        const connection = makeConnection()
        connections.push(connection)
        return connection.reply
      }) as unknown as typeof fetch,
      reconnectDelay: (attempt) => 100 * attempt,
      scheduleRetry: (fn, delayMs) => { scheduled.push({ fn, delayMs }) },
      now: () => Date.now(),
    })
    await settle()
    expect(connections.length).toBe(1)

    // A proxy kills the socket: clean end-of-body → reconnect with backoff.
    connections[0].end()
    await settle()
    expect(subscription.getHealth()).toMatchObject({ state: 'retrying', attempts: 1 })
    expect(scheduled.length).toBe(1)
    expect(scheduled[0].delayMs).toBe(100)

    // The retry opens a new connection; health resets to open/0.
    connections.length = 0
    scheduled[0].fn()
    await settle()
    expect(connections.length).toBe(1)
    expect(subscription.getHealth()).toMatchObject({ state: 'open', attempts: 0 })

    subscription.close()
  })

  it('an abrupt stream error also schedules a retry', async () => {
    const connections: FakeConnection[] = []
    const scheduled: Array<{ fn: () => void; delayMs: number }> = []

    const subscription = openSessionEventSubscription({
      url: '/api/sessions/s1/events',
      onEvent: () => {},
      fetchImpl: (async () => {
        const connection = makeConnection()
        connections.push(connection)
        return connection.reply
      }) as unknown as typeof fetch,
      reconnectDelay: (attempt) => 100 * attempt,
      scheduleRetry: (fn, delayMs) => { scheduled.push({ fn, delayMs }) },
      now: () => Date.now(),
    })
    await settle()

    connections[0].abort()
    await settle()
    expect(subscription.getHealth()).toMatchObject({ state: 'retrying', attempts: 1 })

    subscription.close()
  })

  it('a fatal status closes the subscription', async () => {
    const fatal: Array<{ reason: unknown }> = []

    const subscription = openSessionEventSubscription({
      url: '/api/sessions/gone/events',
      onEvent: () => {},
      onFatal: (reason) => { fatal.push({ reason }) },
      fetchImpl: (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch,
      reconnectDelay: () => 5,
      scheduleRetry: (fn) => { void fn },
      now: () => Date.now(),
    })
    await settle()

    expect(subscription.getHealth().state).toBe('closed')
    expect(fatal).toEqual([{ reason: 'not-found' }])
  })

  it('close() tears down retries and reports closed', async () => {
    const connections: FakeConnection[] = []
    const scheduled: Array<{ fn: () => void; delayMs: number }> = []

    const subscription = openSessionEventSubscription({
      url: '/api/sessions/s1/events',
      onEvent: () => {},
      fetchImpl: (async () => {
        const connection = makeConnection()
        connections.push(connection)
        return connection.reply
      }) as unknown as typeof fetch,
      reconnectDelay: () => 100,
      scheduleRetry: (fn, delayMs) => { scheduled.push({ fn, delayMs }) },
      now: () => Date.now(),
    })
    await settle()

    connections[0].end()
    await settle()
    subscription.close()

    expect(subscription.getHealth().state).toBe('closed')
    // The pending retry must not fire a reconnection after an explicit close.
    if (scheduled[0]) scheduled[0].fn()
    await settle()
    expect(subscription.getHealth().state).toBe('closed')
  })
})