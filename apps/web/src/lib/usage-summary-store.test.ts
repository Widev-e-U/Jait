import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let token: string | null = 'alice'
vi.mock('@/lib/auth-token', () => ({ getAuthToken: () => token }))
vi.mock('@/lib/gateway-url', () => ({ getApiUrl: () => 'http://gateway' }))
const data = (percent: number) => ({ generatedAt: new Date().toISOString(), profiles: [{ id: 'profile', percent }] })
beforeEach(() => { token = 'alice'; vi.resetModules(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('shares prefetches and keeps prepared usage on reopen without another request', async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) => Response.json(data(url.endsWith('=0') ? 10 : 42)))
  vi.stubGlobal('fetch', fetch)
  const store = await import('./usage-summary-store')
  await Promise.all([store.refreshUsageSummary(), store.refreshUsageSummary()])
  expect(fetch).toHaveBeenCalledTimes(2) // local snapshot + one live request
  expect(store.getUsageSummary()).toEqual(data(42))
  await store.refreshUsageSummary()
  expect(fetch).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(300_000)
  await store.refreshUsageSummary()
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('runs the live refresh a user asked for even while a background request is in flight', async () => {
  const modes: string[] = []
  const releases: Array<(response: Response) => void> = []
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    modes.push(url.split('refresh=')[1])
    return new Promise<Response>(resolve => { releases.push(resolve) })
  }))
  const store = await import('./usage-summary-store')
  const automatic = store.refreshUsageSummary()
  await vi.advanceTimersByTimeAsync(0)
  expect(modes).toEqual(['0'])
  releases[0](Response.json(data(10)))
  await vi.advanceTimersByTimeAsync(0)
  expect(modes).toEqual(['0', '1'])
  const manual = store.refreshUsageSummary(true)
  releases[1](Response.json(data(20)))
  await vi.advanceTimersByTimeAsync(0)
  expect(modes).toEqual(['0', '1', 'force'])
  releases[2](Response.json(data(100)))
  await Promise.all([automatic, manual])
  expect(store.getUsageSummary()).toEqual(data(100))
})

it('does not publish a previous user response after switching accounts', async () => {
  let release!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>(resolve => { release = resolve })))
  const store = await import('./usage-summary-store')
  const old = store.refreshUsageSummary()
  token = 'bob'
  expect(store.getUsageSummary()).toBeNull()
  release(Response.json(data(90)))
  await old
  expect(store.getUsageSummary()).toBeNull()
})

it('keeps the saved snapshot and backs off when a provider refresh fails', async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) => url.endsWith('=0')
    ? Response.json(data(10)) : new Response('unavailable', { status: 503 }))
  vi.stubGlobal('fetch', fetch)
  const store = await import('./usage-summary-store')
  await expect(store.refreshUsageSummary()).rejects.toThrow('503')
  expect(store.getUsageSummary()).toEqual(data(10))
  vi.advanceTimersByTime(5 * 60_000)
  await store.refreshUsageSummary()
  expect(fetch).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(5 * 60_000)
  await expect(store.refreshUsageSummary()).rejects.toThrow('503')
  expect(fetch).toHaveBeenCalledTimes(3)
})
