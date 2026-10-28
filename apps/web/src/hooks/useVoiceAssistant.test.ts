import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVoiceAssistant } from './useVoiceAssistant'

vi.mock('@/lib/gateway-url', () => ({ getApiUrl: () => 'http://localhost:8000' }))

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => unknown> }))
vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => unknown) => hooks.effects.push(effect),
}))

class Socket {
  static OPEN = 1
  static latest: Socket
  readyState = 0
  onopen?: () => void
  onclose: (() => void) | null = null
  onerror?: (event: unknown) => void
  onmessage?: (event: { data: string }) => void
  send = vi.fn()
  close = vi.fn()
  constructor(public url: string) { Socket.latest = this }
  open() { this.readyState = Socket.OPEN; this.onopen?.() }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }) }
}
const workletConnect = vi.fn()
class Worklet {
  port = { onmessage: null }
  connect = workletConnect
  disconnect = vi.fn()
}
class Context {
  destination = {}
  state = 'running'
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) }
  createMediaStreamSource() { return { connect: vi.fn() } }
  createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0 } }
  close = vi.fn().mockResolvedValue(undefined)
}

function setup(getUserMedia: () => Promise<unknown>) {
  vi.stubGlobal('window', { location: { protocol: 'http:', hostname: 'localhost', port: '8000', host: 'localhost:8000' } })
  vi.stubGlobal('WebSocket', Socket)
  vi.stubGlobal('AudioContext', Context)
  vi.stubGlobal('AudioWorkletNode', Worklet)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  return useVoiceAssistant({ authToken: 'token' })
}

afterEach(() => { hooks.effects = []; workletConnect.mockReset(); Socket.latest = undefined as unknown as Socket; vi.unstubAllGlobals() })

describe('voice session handoff', () => {
  it('sends the wake-word request once when the realtime session is ready and connects the capture worklet', async () => {
    const stream = { getTracks: () => [], getAudioTracks: () => [] }
    const voice = setup(async () => stream)
    const connecting = voice.connect('check my network')
    await vi.waitFor(() => expect(Socket.latest).toBeDefined())
    expect(Socket.latest.url).toBe('ws://localhost:8000/ws/voice-assistant?token=token')
    Socket.latest.open()
    Socket.latest.message({ type: 'session.started' })
    Socket.latest.message({ type: 'session.started' })
    await connecting
    const messages = Socket.latest.send.mock.calls.map(([text]) => JSON.parse(text))
    expect(messages).toEqual([{ type: 'initial_text', text: 'check my network' }])
    expect(workletConnect).toHaveBeenCalledOnce()
    voice.disconnect()
  })
  it('stops a microphone that becomes available after the user ends the connection', async () => {
    let resolve!: (stream: unknown) => void
    const stop = vi.fn()
    const voice = setup(() => new Promise(r => { resolve = r }))
    const connecting = voice.connect('hello')
    await vi.waitFor(() => expect(Socket.latest).toBeDefined())
    Socket.latest.open()
    await vi.waitFor(() => expect(resolve).toBeDefined())
    voice.disconnect()
    resolve({ getTracks: () => [{ stop }], getAudioTracks: () => [] })
    await connecting
    expect(stop).toHaveBeenCalledOnce()
    expect(workletConnect).not.toHaveBeenCalled()
  })
})
