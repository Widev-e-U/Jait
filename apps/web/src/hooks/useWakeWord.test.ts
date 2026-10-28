import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeWord } from './useWakeWord'

const mocks = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, fetch: vi.fn() }))
vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => unknown) => mocks.effects.push(effect),
}))
vi.mock('@/lib/api-fetch', () => ({ apiFetch: mocks.fetch }))
vi.mock('@/lib/gateway-url', () => ({ getApiUrl: () => '' }))

class Recognition {
  static latest: Recognition
  start = vi.fn()
  abort = vi.fn()
  onstart?: () => void
  onend?: () => void
  onresult?: (event: unknown) => void
  constructor() { Recognition.latest = this }
  result(transcript: string, isFinal = true) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal })] })
  }
}

afterEach(() => { mocks.effects = []; mocks.fetch.mockReset(); vi.useRealTimers(); vi.unstubAllGlobals() })

function setup(onActivate: (text: string) => void) {
  vi.stubGlobal('window', { SpeechRecognition: Recognition })
  vi.stubGlobal('navigator', { language: 'en-US' })
  // React hooks are mocked in this test harness.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useWakeWord({ enabled: true, token: 'token', onActivate })
  return mocks.effects.map(effect => effect()).find(value => typeof value === 'function') as () => void
}

describe('wake-word listener', () => {
  it('starts one session with the original command and does not send clear matches to System One', () => {
    const activate = vi.fn()
    const cleanup = setup(activate)
    Recognition.latest.result('Hey, Jade, check my network')
    Recognition.latest.result('Hey, Jade, check my network')
    expect(activate).toHaveBeenCalledOnce()
    expect(activate).toHaveBeenCalledWith('check my network')
    expect(mocks.fetch).not.toHaveBeenCalled()
    cleanup()
  })
  it('captures a sentence spoken after the wake phrase alone', () => {
    vi.useFakeTimers()
    const activate = vi.fn()
    const cleanup = setup(activate)
    Recognition.latest.result('Hey Jade')
    expect(activate).not.toHaveBeenCalled()
    Recognition.latest.result('check my network', false)
    vi.advanceTimersByTime(3000)
    expect(activate).not.toHaveBeenCalled()
    Recognition.latest.result('check my network')
    expect(activate).toHaveBeenCalledOnce()
    expect(activate).toHaveBeenCalledWith('check my network')
    cleanup()
  })
  it('opens the session after a bare wake phrase if no follow-up is spoken', () => {
    vi.useFakeTimers()
    const activate = vi.fn()
    const cleanup = setup(activate)
    Recognition.latest.result('Hey Jait')
    vi.advanceTimersByTime(2200)
    expect(activate).toHaveBeenCalledExactlyOnceWith('')
    cleanup()
  })
  it('passes an approved ambiguous request into the session once', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ activate: true }) })
    const activate = vi.fn()
    const cleanup = setup(activate)
    Recognition.latest.result('Hey Jay, check my network')
    await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce())
    expect(activate).toHaveBeenCalledWith('check my network')
    cleanup()
  })
  it('does not activate after disabling while an ambiguous candidate is in flight', async () => {
    let resolve!: (value: unknown) => void
    mocks.fetch.mockReturnValue(new Promise(r => { resolve = r }))
    const activate = vi.fn()
    const cleanup = setup(activate)
    Recognition.latest.result('Hey Jay, check my network')
    expect(mocks.fetch).toHaveBeenCalledOnce()
    const signal = mocks.fetch.mock.calls[0]?.[1]?.signal as AbortSignal
    cleanup()
    expect(signal.aborted).toBe(true)
    resolve({ ok: true, json: async () => ({ activate: true }) })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(activate).not.toHaveBeenCalled()
  })
})
