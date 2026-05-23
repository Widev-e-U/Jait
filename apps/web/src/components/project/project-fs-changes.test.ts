import { describe, expect, it } from 'vitest'

import { fsChangesIncludeFile } from './project-fs-changes'

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
