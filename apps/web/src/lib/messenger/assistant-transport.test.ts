import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindMessengerAssistant } from './assistant-transport'
import type { MessengerStore } from './store'

vi.mock('@/lib/gateway-url', () => ({ getWsUrl: () => 'ws://gateway.test' }))
class Socket {
  static OPEN = 1
  static current: Socket
  readyState = 1
  onopen?: () => void
  onmessage?: (event: { data: string }) => void
  onclose?: () => void
  onerror?: () => void
  send = vi.fn()
  close = vi.fn()
  constructor() { Socket.current = this }
  receive(type: string, payload: unknown) { this.onmessage?.({ data: JSON.stringify({ type, payload }) }) }
}
afterEach(() => vi.unstubAllGlobals())

describe('Messenger browser transport', () => {
  it('registers after authentication, returns only command results, and deduplicates requests', async () => {
    vi.stubGlobal('WebSocket', Socket)
    const assistantCommand = vi.fn().mockResolvedValue({ ok: true, message: 'done', data: { messages: [] } })
    const store = { getSnapshot: () => ({ assistantAccess: true, status: 'ready' }), assistantCommand } as unknown as MessengerStore
    const stop = bindMessengerAssistant(store, 'jait-auth-token')
    const ws = Socket.current
    ws.onopen?.()
    expect(JSON.parse(ws.send.mock.calls[0]![0])).toEqual({ type: 'authenticate', token: 'jait-auth-token' })
    ws.receive('session.created', { authenticated: true })
    expect(JSON.parse(ws.send.mock.calls[1]![0])).toEqual({ type: 'messenger.register', payload: { enabled: true } })
    const request = { requestId: 'id', command: { action: 'status' }, expiresAt: Date.now() + 5000 }
    ws.receive('messenger.request', request)
    ws.receive('messenger.request', request)
    await Promise.resolve()
    expect(assistantCommand).toHaveBeenCalledExactlyOnceWith(request.command, request.expiresAt)
    expect(JSON.parse(ws.send.mock.calls[2]![0])).toMatchObject({ type: 'messenger.result', payload: { requestId: 'id', result: { ok: true } } })
    stop()
    expect(ws.close).toHaveBeenCalledOnce()
  })
  it('does not open a socket without explicit access', () => {
    const constructor = vi.fn()
    vi.stubGlobal('WebSocket', constructor)
    const stop = bindMessengerAssistant({ getSnapshot: () => ({ assistantAccess: false, status: 'ready' }) } as unknown as MessengerStore, 'token')
    expect(constructor).not.toHaveBeenCalled()
    stop()
  })
})
