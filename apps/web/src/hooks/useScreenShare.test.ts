import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScreenShare } from './useScreenShare'

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => unknown> }))
const toastMock = vi.hoisted(() => Object.assign(vi.fn((_message: string, _options: unknown) => 'toast-id'), { dismiss: vi.fn() }))
vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => unknown) => hooks.effects.push(effect),
}))
vi.mock('@/lib/gateway-url', () => ({ getApiUrl: () => '', getWsUrl: () => 'ws://gateway' }))
vi.mock('@/lib/device-id', () => ({ generateDeviceId: () => 'web-device', detectPlatform: () => 'web' }))
vi.mock('sonner', () => ({ toast: toastMock }))

afterEach(() => {
  hooks.effects = []
  toastMock.mockClear()
  toastMock.dismiss.mockClear()
  vi.unstubAllGlobals()
})

describe('screen share signaling', () => {
  it.each([true, false])('waits for the gateway approval before capture (approved=%s)', async approved => {
    let resolveApproval!: (value: unknown) => void
    const approval = new Promise(resolve => { resolveApproval = resolve })
    const capture = vi.fn(() => new Promise(() => {}))
    const sockets: Array<{ onmessage?: (event: { data: string }) => void; close: ReturnType<typeof vi.fn> }> = []
    class Socket {
      onmessage?: (event: { data: string }) => void
      close = vi.fn()
      constructor() { sockets.push(this) }
    }
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux', mediaDevices: { getDisplayMedia: capture } })
    vi.stubGlobal('WebSocket', Socket)
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/approve')
      ? approval
      : Promise.resolve({ ok: true, json: async () => ({ devices: [], activeSession: null }) })))
    useScreenShare({ token: 'token' })
    const cleanups = hooks.effects.map(effect => effect())
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'screen-share:start-request', payload: {
      sessionId: 'share-one', hostDeviceId: 'web-device', viewerDeviceIds: ['viewer'],
      initiatedBy: 'agent', requireConsent: true,
    } }) })
    const options = toastMock.mock.calls[0]![1] as { action: { onClick: () => void } }
    options.action.onClick()
    expect(capture).not.toHaveBeenCalled()
    resolveApproval(approved
      ? { ok: true, json: async () => ({ session: { id: 'share-one', status: 'sharing', pendingApproval: false } }) }
      : { ok: false, status: 503 })
    if (approved) await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce())
    else {
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(capture).not.toHaveBeenCalled()
    }
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup() })
  })

  it('does not connect before authentication', () => {
    const socket = vi.fn()
    const fetchMock = vi.fn()
    vi.stubGlobal('window', {})
    vi.stubGlobal('WebSocket', socket)
    vi.stubGlobal('fetch', fetchMock)
    useScreenShare({ token: null })
    hooks.effects.forEach(effect => effect())
    expect(socket).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops captured tracks when creating the share fails', async () => {
    const stop = vi.fn()
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', {
      userAgent: 'Chrome', platform: 'Linux',
      mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue({ getVideoTracks: () => [{ label: 'Screen' }], getTracks: () => [{ stop }] }) },
    })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Cannot start' }) }))
    const share = useScreenShare({ token: 'token' })
    await share.startHosting()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('replaces the viewer connection when joining a different share', async () => {
    const peers: Array<{ close: ReturnType<typeof vi.fn> }> = []
    class Peer {
      close = vi.fn()
      constructor() { peers.push(this) }
    }
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux' })
    vi.stubGlobal('RTCPeerConnection', Peer)
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/join')) {
        const { sessionId } = JSON.parse(String(options?.body)) as { sessionId: string }
        return { ok: true, json: async () => ({ session: { id: sessionId } }) }
      }
      return { ok: true, json: async () => ({}) }
    }))
    const share = useScreenShare({ token: 'token' })
    await share.requestRemoteShare('host-one', 'share-one')
    await share.requestRemoteShare('host-two', 'share-two')
    expect(peers).toHaveLength(2)
    expect(peers[0]!.close).toHaveBeenCalledOnce()
    expect(peers[1]!.close).not.toHaveBeenCalled()
  })

  it('keeps the current connection when another share stops', async () => {
    const peers: Array<{ close: ReturnType<typeof vi.fn> }> = []
    class Peer { close = vi.fn(); constructor() { peers.push(this) } }
    const sockets: Array<{ onmessage?: (event: { data: string }) => void; close: ReturnType<typeof vi.fn> }> = []
    class Socket {
      onmessage?: (event: { data: string }) => void
      close = vi.fn()
      constructor() { sockets.push(this) }
    }
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux' })
    vi.stubGlobal('RTCPeerConnection', Peer)
    vi.stubGlobal('WebSocket', Socket)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () =>
      url.endsWith('/join') ? { session: { id: 'current' } } : { devices: [], activeSession: null },
    })))
    const share = useScreenShare({ token: 'token' })
    const cleanups = hooks.effects.map(effect => effect())
    await share.requestRemoteShare('host', 'current')
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'screen-share:state-update', payload: {
      id: 'other', status: 'idle', hostDeviceId: 'host', viewers: [{ deviceId: 'web-device' }],
    } }) })
    expect(peers[0]!.close).not.toHaveBeenCalled()
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup() })
  })

  it('stops a late capture when its share was stopped while the picker was open', async () => {
    let finishCapture!: (stream: unknown) => void
    const trackStop = vi.fn()
    const peers = vi.fn()
    const sockets: Array<{ onmessage?: (event: { data: string }) => void; close: ReturnType<typeof vi.fn> }> = []
    class Socket { onmessage?: (event: { data: string }) => void; close = vi.fn(); constructor() { sockets.push(this) } }
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux', mediaDevices: {
      getDisplayMedia: () => new Promise(resolve => { finishCapture = resolve }),
    } })
    vi.stubGlobal('RTCPeerConnection', peers)
    vi.stubGlobal('WebSocket', Socket)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ devices: [], activeSession: null }) }))
    const share = useScreenShare({ token: 'token' })
    const cleanups = hooks.effects.map(effect => effect())
    const starting = share.startHosting('share-one')
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'screen-share:state-update', payload: {
      id: 'share-one', status: 'idle', hostDeviceId: 'web-device', viewers: [],
    } }) })
    finishCapture({ getVideoTracks: () => [{ label: 'Screen' }], getTracks: () => [{ stop: trackStop }] })
    await starting
    expect(trackStop).toHaveBeenCalledOnce()
    expect(peers).not.toHaveBeenCalled()
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup() })
  })

  it('cancels an old pending capture without closing the newer viewer connection', async () => {
    let finishCapture!: (stream: unknown) => void
    const trackStop = vi.fn()
    const peers: Array<{ close: ReturnType<typeof vi.fn> }> = []
    class Peer { close = vi.fn(); constructor() { peers.push(this) } }
    const sockets: Array<{ onmessage?: (event: { data: string }) => void; close: ReturnType<typeof vi.fn> }> = []
    class Socket { onmessage?: (event: { data: string }) => void; close = vi.fn(); constructor() { sockets.push(this) } }
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux', mediaDevices: {
      getDisplayMedia: () => new Promise(resolve => { finishCapture = resolve }),
    } })
    vi.stubGlobal('RTCPeerConnection', Peer)
    vi.stubGlobal('WebSocket', Socket)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () =>
      url.endsWith('/join') ? { session: { id: 'new' } } : { devices: [], activeSession: null },
    })))
    const share = useScreenShare({ token: 'token' })
    const cleanups = hooks.effects.map(effect => effect())
    const starting = share.startHosting('old')
    await share.requestRemoteShare('host', 'new')
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'screen-share:state-update', payload: {
      id: 'old', status: 'idle', hostDeviceId: 'web-device', viewers: [],
    } }) })
    finishCapture({ getVideoTracks: () => [{ label: 'Screen' }], getTracks: () => [{ stop: trackStop }] })
    await starting
    expect(trackStop).toHaveBeenCalledOnce()
    expect(peers[0]!.close).not.toHaveBeenCalled()
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup() })
  })

  it('does not capture after a pending approval was stopped', async () => {
    let finishApproval!: (response: unknown) => void
    const capture = vi.fn()
    const sockets: Array<{ onmessage?: (event: { data: string }) => void; close: ReturnType<typeof vi.fn> }> = []
    class Socket { onmessage?: (event: { data: string }) => void; close = vi.fn(); constructor() { sockets.push(this) } }
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux', mediaDevices: { getDisplayMedia: capture } })
    vi.stubGlobal('WebSocket', Socket)
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/approve')
      ? new Promise(resolve => { finishApproval = resolve })
      : Promise.resolve({ ok: true, json: async () => ({ devices: [], activeSession: null }) })))
    useScreenShare({ token: 'token' })
    const cleanups = hooks.effects.map(effect => effect())
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'screen-share:start-request', payload: {
      sessionId: 'share-one', hostDeviceId: 'web-device', viewerDeviceIds: ['viewer'], initiatedBy: 'agent', requireConsent: true,
    } }) })
    const options = toastMock.mock.calls[0]![1] as { action: { onClick: () => void } }
    options.action.onClick()
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'screen-share:state-update', payload: {
      id: 'share-one', status: 'idle', hostDeviceId: 'web-device', viewers: [],
    } }) })
    finishApproval({ ok: true, json: async () => ({ session: { id: 'share-one', status: 'sharing', pendingApproval: false } }) })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(capture).not.toHaveBeenCalled()
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup() })
  })

  it('disconnects the attached share without stopping an unrelated global share', async () => {
    class Peer { close = vi.fn() }
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () =>
      url.endsWith('/join') ? { session: { id: 'chat-share' } } : {},
    }))
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux' })
    vi.stubGlobal('RTCPeerConnection', Peer)
    vi.stubGlobal('fetch', fetchMock)
    const share = useScreenShare({ token: 'token' })
    await share.requestRemoteShare('host', 'chat-share')
    await share.disconnect()
    expect(fetchMock).toHaveBeenCalledWith('/api/screen-share/stop', expect.objectContaining({
      body: JSON.stringify({ sessionId: 'chat-share' }),
    }))
  })

  it('registers a web viewer and opens its signaling socket after authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ devices: [], activeSession: null }) })
    const sockets: Array<{ onopen?: () => void; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = []
    class Socket {
      onopen?: () => void
      send = vi.fn()
      close = vi.fn()
      constructor(public url: string) { sockets.push(this) }
    }
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux' })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('WebSocket', Socket)

    useScreenShare({ token: 'token' })
    const cleanups = hooks.effects.map(effect => effect())
    expect(sockets).toHaveLength(1)
    sockets[0]!.onopen?.()
    expect(sockets[0]!.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', deviceId: 'web-device' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/screen-share/devices/register', expect.objectContaining({
      body: expect.stringContaining('"platform":"web"'),
    }))
    await Promise.resolve()
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup() })
  })
})
