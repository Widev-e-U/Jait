import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScreenShareControl } from './useScreenShareControl'
import type { ScreenShareHandle } from './useScreenShare'
import type { ScreenShareSessionState } from '@jait/shared'

vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
}))
vi.mock('@/lib/gateway-url', () => ({ API_URL: '' }))

afterEach(() => vi.unstubAllGlobals())

describe('screen share control lease', () => {
  it('ignores a failure from an old lease after a new lease starts', async () => {
    let rejectAction!: (error: Error) => void
    let starts = 0
    const requests: Array<{ operation: string; controlId?: string }> = []
    vi.stubGlobal('fetch', vi.fn((url: string, options: { body: string }) => {
      const operation = url.split('/').at(-1)!
      const body = JSON.parse(options.body) as { controlId?: string }
      requests.push({ operation, controlId: body.controlId })
      if (operation === 'act') return new Promise((_resolve, reject) => { rejectAction = reject })
      const data = operation === 'start' ? { ok: true, controlId: `lease-${++starts}` } : { ok: true }
      return Promise.resolve({ ok: true, json: async () => data })
    }))
    const share = { localDeviceId: 'viewer', requestControlHandoff: vi.fn().mockResolvedValue(true) } as unknown as ScreenShareHandle
    const session = { id: 'share', status: 'sharing', controlOwner: 'user', pendingApproval: false } as ScreenShareSessionState
    const control = useScreenShareControl('chat', session, share)
    await control.takeControl()
    control.send({ action: 'key', combo: 'a' })
    await vi.waitFor(() => expect(rejectAction).toBeTypeOf('function'))
    await control.agentMode()
    await control.takeControl()
    rejectAction(new Error('old request failed'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(requests.filter(request => request.operation === 'cancel')).toEqual([
      { operation: 'cancel', controlId: 'lease-1' },
    ])
    control.send({ action: 'key', combo: 'b' })
    await vi.waitFor(() => expect(requests.some(request => request.operation === 'act' && request.controlId === 'lease-2')).toBe(true))
  })
})
