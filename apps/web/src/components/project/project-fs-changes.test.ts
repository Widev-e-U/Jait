import { describe, expect, it } from 'vitest'

import {
  fsChangesIncludeFile,
  getFsWatcherRefreshDirs,
  shouldRefreshSourceControlForStateKey,
} from './project-fs-changes'

describe('source control refresh', () => {
  it('refreshes immediately for agent file-change events', () => {
    expect(shouldRefreshSourceControlForStateKey('file_changed')).toBe(true)
    expect(shouldRefreshSourceControlForStateKey('todo_list')).toBe(false)
  })
})

describe('fsChangesIncludeFile', () => {
  it('matches project-relative watcher paths to the active file', () => {
    expect(fsChangesIncludeFile(
      { surfaceId: 'fs-1', changes: [{ path: 'AGENTS.md', type: 'updated' }] },
      '/home/alice/jait',
      '/home/alice/jait/AGENTS.md',
    )).toBe(true)
  })

  it('ignores unrelated watcher paths', () => {
    expect(fsChangesIncludeFile(
      { surfaceId: 'fs-1', changes: [{ path: 'packages/gateway/package.json', type: 'updated' }] },
      '/home/alice/jait',
      '/home/alice/jait/AGENTS.md',
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
      '/home/alice/jait',
      new Set([
        '/home/alice/jait/packages',
        '/home/alice/jait/packages/gateway',
        '/home/alice/jait/apps/web',
      ]),
    )).toEqual(['/home/alice/jait/packages/gateway'])
  })

  it('refreshes the parent instead of a deleted expanded directory itself', () => {
    expect(getFsWatcherRefreshDirs(
      { surfaceId: 'fs-1', changes: [{ path: 'packages/gateway', type: 'deleted' }] },
      '/home/alice/jait',
      new Set([
        '/home/alice/jait/packages',
        '/home/alice/jait/packages/gateway',
      ]),
    )).toEqual(['/home/alice/jait/packages'])
  })

  it('falls back to the root for root-level changes', () => {
    expect(getFsWatcherRefreshDirs(
      { surfaceId: 'fs-1', changes: [{ path: 'package.json', type: 'updated' }] },
      '/home/alice/jait',
      new Set(['/home/alice/jait/packages']),
    )).toEqual(['/home/alice/jait'])
  })
})
