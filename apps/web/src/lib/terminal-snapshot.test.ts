import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateTerminalSnapshot, loadTerminalSnapshot } from './terminal-snapshot'

beforeEach(() => invalidateTerminalSnapshot())
afterEach(() => vi.unstubAllGlobals())

describe('shared terminal snapshots', () => {
  it('shares requests across callers and keeps the result until an event invalidates it', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ terminals: [{ id: 'term-1' }] }) })
    vi.stubGlobal('fetch', fetcher)
    const first = loadTerminalSnapshot('account-a')
    expect(loadTerminalSnapshot('account-a', true)).toBe(first)
    await first
    await loadTerminalSnapshot('account-a')
    expect(fetcher).toHaveBeenCalledTimes(1)
    invalidateTerminalSnapshot()
    await loadTerminalSnapshot('account-a')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps auth scopes separate', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ terminals: [] }) })
    vi.stubGlobal('fetch', fetcher)
    await Promise.all([loadTerminalSnapshot('account-a'), loadTerminalSnapshot('account-b')])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer account-a' })
    expect(fetcher.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer account-b' })
  })

  it('allows recovery after a failed lookup', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ terminals: [] }) })
    vi.stubGlobal('fetch', fetcher)
    await expect(loadTerminalSnapshot()).rejects.toThrow('Terminal snapshot unavailable')
    await expect(loadTerminalSnapshot()).resolves.toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not let an older failed request evict the new snapshot', async () => {
    let rejectOld: (reason: Error) => void = () => {}
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject }))
      .mockResolvedValue({ ok: true, json: async () => ({ terminals: [{ id: 'new' }] }) })
    vi.stubGlobal('fetch', fetcher)
    const old = loadTerminalSnapshot()
    const failed = expect(old).rejects.toThrow('offline')
    invalidateTerminalSnapshot()
    await loadTerminalSnapshot()
    rejectOld(new Error('offline'))
    await failed
    expect(await loadTerminalSnapshot()).toEqual([{ id: 'new' }])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
