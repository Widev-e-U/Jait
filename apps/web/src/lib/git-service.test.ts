import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitStatusResult } from './git-transport'
function status(): GitStatusResult {
  const file = { path: 'same.ts', status: 'M', insertions: 1, deletions: 0 }
  return { branch: 'main', hasWorkingTreeChanges: true,
    index: { files: [file], insertions: 1, deletions: 0 }, workingTree: { files: [file], insertions: 1, deletions: 0 },
    hasUpstream: false, aheadCount: 0, behindCount: 0, pr: null, ghAvailable: false, prProvider: 'none', remoteUrl: null }
}
let service: typeof import('./git-service')
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(async () => {
  vi.resetModules()
  fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => status() }))
  vi.stubGlobal('fetch', fetchMock)
  service = await import('./git-service')
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('shared Git service', () => {
  it('coalesces concurrent consumers and reuses fresh status without downloading diffs', async () => {
    await Promise.all(Array.from({ length: 10 }, () => service.gitApi.status('/repo')))
    await service.gitApi.status('/repo')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/status')
    expect(service.getGitChangeCounts(service.gitChangeCountsKey(null, '/repo')).fileCount).toBe(1)
  })
  it('isolates nodes, comparison branches and projects', async () => {
    await Promise.all([
      service.gitApi.status('/repo'), service.gitApi.status('/repo', undefined, 'remote'),
      service.gitApi.status('/other'), service.gitApi.status('/repo', 'feature'),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(service.getGitChangeCounts(service.gitChangeCountsKey(null, '/new')).ready).toBe(false)
  })
  it('preserves the snapshot identity when polling returns unchanged data', async () => {
    await service.gitApi.status('/repo')
    const key = service.gitChangeCountsKey(null, '/repo')
    const previous = service.getGitChangeCounts(key)
    await service.refreshGitChangeCounts(null, '/repo')
    expect(service.getGitChangeCounts(key)).toBe(previous)
  })
  it('does not publish a stale response when a refresh arrives during a request', async () => {
    let resolve!: (value: unknown) => void
    fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const first = service.gitApi.status('/repo')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const refresh = service.refreshGitChangeCounts(null, '/repo')
    resolve({ ok: true, json: async () => ({ ...status(), branch: 'old' }) })
    await Promise.all([first, refresh])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(service.getGitChangeCounts(service.gitChangeCountsKey(null, '/repo')).branch).toBe('main')
  })
  it('invalidates a fresh status after a mutation, including partial failures', async () => {
    await service.gitApi.status('/repo')
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'push failed' }) })
    await expect(service.gitApi.runStackedAction('/repo', 'commit_push')).rejects.toThrow('push failed')
    await service.gitApi.status('/repo')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it('retains last good counts on a transient error and recovers on refresh', async () => {
    await service.gitApi.status('/repo')
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await service.refreshGitChangeCounts(null, '/repo')
    const key = service.gitChangeCountsKey(null, '/repo')
    expect(service.getGitChangeCounts(key)).toMatchObject({ fileCount: 1, error: 'offline' })
    await service.refreshGitChangeCounts(null, '/repo')
    expect(service.getGitChangeCounts(key).error).toBeNull()
  })
})
