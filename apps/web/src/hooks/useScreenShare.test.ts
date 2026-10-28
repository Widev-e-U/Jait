import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScreenShare } from './useScreenShare'

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, setters: [] as Array<ReturnType<typeof vi.fn>> }))
const toastMock = vi.hoisted(() => Object.assign(vi.fn((_message: string, _options: unknown) => 'toast-id'), { dismiss: vi.fn() }))
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const setter = vi.fn()
    hooks.setters.push(setter)
    return [initial, setter]
  },
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => unknown) => hooks.effects.push(effect),
}))
vi.mock('@/lib/gateway-url', () => ({ getApiUrl: () => '', getWsUrl: () => 'ws://gateway' }))
vi.mock('@/lib/device-id', () => ({ generateDeviceId: () => 'web-device', detectPlatform: () => 'web' }))
vi.mock('sonner', () => ({ toast: toastMock }))

afterEach(() => {
  hooks.effects = []
  hooks.setters = []
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

  it('requires an explicit host decision for an agent request even if it claims no consent is needed', () => {
    const sockets: Array<{ onmessage?: (event: { data: string }) => void; close: ReturnType<typeof vi.fn> }> = []
    class Socket { onmessage?: (event: { data: string }) => void; close = vi.fn(); constructor() { sockets.push(this) } }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ devices: [], activeSession: null }) })
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(['*']) })
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux' })
    vi.stubGlobal('WebSocket', Socket)
    vi.stubGlobal('fetch', fetchMock)
    useScreenShare({ token: 'token' })
    const cleanups = hooks.effects.map(effect => effect())
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'screen-share:start-request', payload: {
      sessionId: 'share', hostDeviceId: 'web-device', viewerDeviceIds: ['viewer'],
      initiatedBy: 'agent', requireConsent: false,
    } }) })
    expect(toastMock).toHaveBeenCalledWith('An agent wants to view this screen', expect.any(Object))
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/approve'))).toBe(false)
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
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/join')) {
        const { sessionId } = JSON.parse(String(options?.body)) as { sessionId: string }
        return { ok: true, json: async () => ({ session: { id: sessionId } }) }
      }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const share = useScreenShare({ token: 'token' })
    await share.requestRemoteShare('host-one', 'share-one')
    await share.requestRemoteShare('host-two', 'share-two')
    expect(peers).toHaveLength(2)
    expect(peers[0]!.close).toHaveBeenCalledOnce()
    expect(peers[1]!.close).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('/api/screen-share/leave', expect.objectContaining({
      body: JSON.stringify({ sessionId: 'share-one', viewerDeviceId: 'web-device' }),
    }))
  })

  it('leaves a stale join when a newer share finishes first', async () => {
    let finishOld!: (value: unknown) => void
    const peers: Array<{ close: ReturnType<typeof vi.fn> }> = []
    class Peer { close = vi.fn(); constructor() { peers.push(this) } }
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith('/join')) {
        const { sessionId } = JSON.parse(String(options?.body)) as { sessionId: string }
        if (sessionId === 'old') return new Promise(resolve => { finishOld = resolve })
        return Promise.resolve({ ok: true, json: async () => ({ session: { id: sessionId, status: 'sharing' } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux' })
    vi.stubGlobal('RTCPeerConnection', Peer)
    vi.stubGlobal('fetch', fetchMock)
    const share = useScreenShare({ token: 'token' })
    const old = share.requestRemoteShare('host-one', 'old')
    await vi.waitFor(() => expect(finishOld).toBeTypeOf('function'))
    await share.requestRemoteShare('host-two', 'new')
    finishOld({ ok: true, json: async () => ({ session: { id: 'old', status: 'sharing' } }) })
    await old
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/screen-share/leave', expect.objectContaining({
      body: JSON.stringify({ sessionId: 'old', viewerDeviceId: 'web-device' }),
    })))
    expect(peers).toHaveLength(1)
    expect(peers[0]!.close).not.toHaveBeenCalled()
  })

  it.each([null, { id: 'global', status: 'sharing' }])(
    'keeps an attached chat share when the gateway-wide state refreshes (global=%s)',
    async activeSession => {
      class Peer { close = vi.fn() }
      const chatSession = { id: 'chat-share', chatId: 'chat-one', status: 'sharing', pendingApproval: false }
      vi.stubGlobal('window', {})
      vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux' })
      vi.stubGlobal('RTCPeerConnection', Peer)
      vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
        ok: true,
        json: async () => url.endsWith('/join')
          ? { session: chatSession }
          : { devices: [{ id: 'device' }], activeSession },
      })))
      const share = useScreenShare({ token: 'token' })
      await share.requestRemoteShare('host', chatSession.id)
      await share.refreshState()
      const state = hooks.setters[0]!.mock.calls.reduce((current, [update]) =>
        typeof update === 'function' ? update(current) : update, share)
      expect(state.session).toEqual(chatSession)
      expect(state.isActive).toBe(true)
      expect(state.isViewer).toBe(true)
      expect(state.devices).toEqual([{ id: 'device' }])
    },
  )

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
    expect(fetchMock).toHaveBeenCalledWith('/api/screen-share/leave', expect.objectContaining({
      body: JSON.stringify({ sessionId: 'chat-share', viewerDeviceId: 'web-device' }),
    }))
  })

  it('keeps separate host peers when viewers join and leave', async () => {
    const peers: Array<Peer> = []
    class Peer {
      close = vi.fn()
      addTrack = vi.fn()
      addIceCandidate = vi.fn().mockResolvedValue(undefined)
      setRemoteDescription = vi.fn().mockResolvedValue(undefined)
      setLocalDescription = vi.fn().mockResolvedValue(undefined)
      createOffer = vi.fn(async () => ({ type: 'offer', sdp: `offer-${peers.indexOf(this)}` }))
      constructor() { peers.push(this) }
    }
    const sockets: Array<Socket> = []
    class Socket {
      static OPEN = 1
      readyState = 1
      onmessage?: (event: { data: string }) => void
      send = vi.fn()
      close = vi.fn()
      constructor() { sockets.push(this) }
    }
    const track = { label: 'Screen', stop: vi.fn(), addEventListener: vi.fn() }
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
    const capture = vi.fn().mockResolvedValue(stream)
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux', mediaDevices: { getDisplayMedia: capture } })
    vi.stubGlobal('WebSocket', Socket)
    vi.stubGlobal('RTCPeerConnection', Peer)
    vi.stubGlobal('RTCSessionDescription', class { constructor(public value: unknown) {} })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/approve')
      ? { session: { id: 'share', status: 'sharing', pendingApproval: false, viewers: [{ deviceId: 'a' }, { deviceId: 'b' }] } }
      : { devices: [], activeSession: null } })))
    useScreenShare({ token: 'token' })
    const cleanups = hooks.effects.map(effect => effect())
    const socket = sockets[0]!
    const deliver = (type: string, payload: unknown) => socket.onmessage?.({ data: JSON.stringify({ type, payload }) })
    deliver('screen-share:start-request', { sessionId: 'share', hostDeviceId: 'web-device', viewerDeviceIds: ['a'], initiatedBy: 'agent', requireConsent: true })
    const options = toastMock.mock.calls[0]![1] as { action: { onClick: () => void } }
    options.action.onClick()
    await vi.waitFor(() => expect(peers).toHaveLength(2))
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(2))
    const offers = socket.send.mock.calls.map(([raw]) => JSON.parse(raw as string))
    expect(offers.map((offer: { payload: { toDeviceId: string } }) => offer.payload.toDeviceId).sort()).toEqual(['a', 'b'])
    deliver('screen-share:start-request', { sessionId: 'share', hostDeviceId: 'web-device', viewerDeviceIds: ['c'] })
    await vi.waitFor(() => expect(peers).toHaveLength(3))
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(3))
    expect(peers[2]!.addTrack).toHaveBeenCalledWith(track, stream)
    expect(capture).toHaveBeenCalledOnce()
    deliver('screen-share:answer', { sessionId: 'share', viewerDeviceId: 'b', sdp: 'answer-b' })
    await vi.waitFor(() => expect(peers[1]!.setRemoteDescription).toHaveBeenCalledOnce())
    expect(peers[0]!.setRemoteDescription).not.toHaveBeenCalled()
    deliver('screen-share:state-update', { id: 'share', status: 'sharing', hostDeviceId: 'web-device', viewers: [{ deviceId: 'a' }, { deviceId: 'c' }] })
    expect(peers[1]!.close).toHaveBeenCalledOnce()
    expect(peers[0]!.close).not.toHaveBeenCalled()
    expect(peers[2]!.close).not.toHaveBeenCalled()
    expect(track.stop).not.toHaveBeenCalled()
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup() })
  })

  it('stops an approved share when the screen picker fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux', mediaDevices: {
      getDisplayMedia: vi.fn().mockRejectedValue(new Error('Capture cancelled')),
    } })
    vi.stubGlobal('fetch', fetchMock)
    const share = useScreenShare({ token: 'token' })
    await share.startHosting('approved-share')
    expect(fetchMock).toHaveBeenCalledWith('/api/screen-share/stop', expect.objectContaining({
      body: JSON.stringify({ sessionId: 'approved-share' }),
    }))
  })

  it('ignores a late answer from a viewer connection that has been replaced', async () => {
    let finishOldDescription!: () => void
    const peers: Peer[] = []
    class Peer {
      close = vi.fn()
      remoteDescription = null
      setRemoteDescription = vi.fn(() => peers.indexOf(this) === 0
        ? new Promise<void>(resolve => { finishOldDescription = resolve })
        : Promise.resolve())
      setLocalDescription = vi.fn().mockResolvedValue(undefined)
      createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'answer' })
      constructor() { peers.push(this) }
    }
    const sockets: Socket[] = []
    class Socket {
      static OPEN = 1
      readyState = 1
      onmessage?: (event: { data: string }) => void
      send = vi.fn()
      close = vi.fn()
      constructor() { sockets.push(this) }
    }
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Linux' })
    vi.stubGlobal('RTCPeerConnection', Peer)
    vi.stubGlobal('RTCSessionDescription', class { constructor(public value: unknown) {} })
    vi.stubGlobal('WebSocket', Socket)
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => ({
      ok: true, json: async () => url.endsWith('/join')
        ? { session: { id: JSON.parse(String(options?.body)).sessionId } }
        : { devices: [], activeSession: null },
    })))
    const share = useScreenShare({ token: 'token' })
    const cleanups = hooks.effects.map(effect => effect())
    const socket = sockets[0]!
    await share.requestRemoteShare('host-one', 'share-one')
    socket.onmessage?.({ data: JSON.stringify({ type: 'screen-share:offer', payload: {
      sessionId: 'share-one', hostDeviceId: 'host-one', sdp: 'old-offer',
    } }) })
    await share.requestRemoteShare('host-two', 'share-two')
    finishOldDescription()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(peers[0]!.createAnswer).not.toHaveBeenCalled()
    expect(socket.send).not.toHaveBeenCalled()
    socket.onmessage?.({ data: JSON.stringify({ type: 'screen-share:offer', payload: {
      sessionId: 'share-two', hostDeviceId: 'host-two', sdp: 'new-offer',
    } }) })
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledOnce())
    expect(JSON.parse(socket.send.mock.calls[0]![0] as string).payload.sessionId).toBe('share-two')
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup() })
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
