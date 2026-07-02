import { describe, expect, it } from 'vitest'

import { fsChangesIncludeFile, getFsWatcherRefreshDirs } from './project-fs-changes'

describe('fsChangesIncludeFile', () => {
  it('matches project-relative watcher paths to the active file', () => {
    expect(fsChangesIncludeFile(
      { surfaceId: 'fs-1', changes: [{ path: 'AGENTS.md', type: 'updated' }] },
      '/home/jakob/jait',
      '/home/jakob/jait/AGENTS.md',
    )).toBe(true)
  })

  it('ignores unrelated watcher paths', () => {
    expect(fsChangesIncludeFile(
      { surfaceId: 'fs-1', changes: [{ path: 'packages/gateway/package.json', type: 'updated' }] },
      '/home/jakob/jait',
      '/home/jakob/jait/AGENTS.md',
    )).toBe(false)
  })

  it('handles windows paths case-insensitively', () => {
    expect(fsChangesIncludeFile(
      { surfaceId: 'fs-1', changes: [{ path: 'agents.md', type: 'updated' }] },
      'E:\\Jait',
      'e:\\Jait\\AGENTS.md',
    )).toBe(true)
  })
})

describe('getFsWatcherRefreshDirs', () => {
  it('refreshes the nearest expanded parent for changed files', () => {
    expect(getFsWatcherRefreshDirs(
      { surfaceId: 'fs-1', changes: [{ path: 'packages/gateway/src/ws.ts', type: 'updated' }] },
      '/home/jakob/jait',
      new Set([
        '/home/jakob/jait/packages',
        '/home/jakob/jait/packages/gateway',
        '/home/jakob/jait/apps/web',
      ]),
    )).toEqual(['/home/jakob/jait/packages/gateway'])
  })

  it('refreshes the parent instead of a deleted expanded directory itself', () => {
    expect(getFsWatcherRefreshDirs(
      { surfaceId: 'fs-1', changes: [{ path: 'packages/gateway', type: 'deleted' }] },
      '/home/jakob/jait',
      new Set([
        '/home/jakob/jait/packages',
        '/home/jakob/jait/packages/gateway',
      ]),
    )).toEqual(['/home/jakob/jait/packages'])
  })

  it('falls back to the root for root-level changes', () => {
    expect(getFsWatcherRefreshDirs(
      { surfaceId: 'fs-1', changes: [{ path: 'package.json', type: 'updated' }] },
      '/home/jakob/jait',
      new Set(['/home/jakob/jait/packages']),
    )).toEqual(['/home/jakob/jait'])
  })
})
