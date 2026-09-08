import { describe, expect, it } from 'vitest'
import {
  buildGitDiffCountMap,
  enrichChangedFilesWithDiffCounts,
  getRelativeProjectPath,
  normalizeProjectPath,
} from './project-path'
import type { GitStatusResult } from './git-api'
import type { ChangedFile } from '@/components/chat'

const ROOT = '/home/user/project'

function makeStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    branch: 'main',
    hasWorkingTreeChanges: true,
    index: { files: [], insertions: 0, deletions: 0 },
    workingTree: { files: [], insertions: 0, deletions: 0 },
    hasUpstream: true,
    aheadCount: 0,
    behindCount: 0,
    pr: null,
    ghAvailable: false,
    prProvider: 'unknown',
    remoteUrl: null,
    ...overrides,
  }
}

describe('normalizeProjectPath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeProjectPath('src\\lib\\utils.ts')).toBe('src/lib/utils.ts')
  })

  it('strips trailing slashes', () => {
    expect(normalizeProjectPath('/home/user/project/')).toBe('/home/user/project')
  })

  it('leaves already-normalized paths untouched', () => {
    expect(normalizeProjectPath('src/lib/utils.ts')).toBe('src/lib/utils.ts')
  })
})

describe('getRelativeProjectPath', () => {
  it('returns the path unchanged when there is no project root', () => {
    expect(getRelativeProjectPath('src/lib/utils.ts', null)).toBe('src/lib/utils.ts')
  })

  it('returns the path unchanged when it is outside the project root', () => {
    expect(getRelativeProjectPath('/other/dir/file.ts', ROOT)).toBe('/other/dir/file.ts')
  })

  it('strips the project root prefix for paths inside it', () => {
    expect(getRelativeProjectPath(`${ROOT}/src/lib/utils.ts`, ROOT)).toBe('src/lib/utils.ts')
  })

  it('handles a root with a trailing slash', () => {
    expect(getRelativeProjectPath(`${ROOT}/src/lib/utils.ts`, `${ROOT}/`)).toBe('src/lib/utils.ts')
  })

  it('does not treat a sibling directory as inside the root', () => {
    expect(getRelativeProjectPath('/home/user/project-other/file.ts', ROOT)).toBe('/home/user/project-other/file.ts')
  })
})

describe('buildGitDiffCountMap', () => {
  it('returns an empty map for a null status', () => {
    expect(buildGitDiffCountMap(null, ROOT).size).toBe(0)
  })

  it('aggregates counts from index and working tree for the same file', () => {
    const status = makeStatus({
      index: { files: [{ path: 'src/a.ts', insertions: 3, deletions: 1, status: 'M' }], insertions: 3, deletions: 1 },
      workingTree: { files: [{ path: 'src/a.ts', insertions: 2, deletions: 0, status: 'M' }], insertions: 2, deletions: 0 },
    })
    const counts = buildGitDiffCountMap(status, ROOT)
    expect(counts.get('src/a.ts')).toEqual({ insertions: 5, deletions: 1 })
  })

  it('keys both the relative and absolute path when a root is given', () => {
    const status = makeStatus({
      workingTree: { files: [{ path: 'src/a.ts', insertions: 1, deletions: 0, status: 'M' }], insertions: 1, deletions: 0 },
    })
    const counts = buildGitDiffCountMap(status, ROOT)
    expect(counts.get('src/a.ts')).toEqual({ insertions: 1, deletions: 0 })
    expect(counts.get(`${ROOT}/src/a.ts`)).toEqual({ insertions: 1, deletions: 0 })
  })

  it('normalizes backslash paths before keying', () => {
    const status = makeStatus({
      workingTree: { files: [{ path: 'src\\a.ts', insertions: 1, deletions: 0, status: 'M' }], insertions: 1, deletions: 0 },
    })
    const counts = buildGitDiffCountMap(status, ROOT)
    expect(counts.get('src/a.ts')).toEqual({ insertions: 1, deletions: 0 })
  })
})

describe('enrichChangedFilesWithDiffCounts', () => {
  const files: ChangedFile[] = [
    { path: `${ROOT}/src/a.ts`, name: 'a.ts', state: 'accepted' },
    { path: `${ROOT}/src/b.ts`, name: 'b.ts', state: 'undecided' },
  ]

  it('returns files unchanged when there is no status', () => {
    expect(enrichChangedFilesWithDiffCounts(files, null, ROOT)).toEqual(files)
  })

  it('enriches files that match the diff counts', () => {
    const status = makeStatus({
      workingTree: { files: [{ path: 'src/a.ts', insertions: 4, deletions: 2, status: 'M' }], insertions: 4, deletions: 2 },
    })
    const result = enrichChangedFilesWithDiffCounts(files, status, ROOT)
    expect(result[0]).toEqual({ ...files[0], insertions: 4, deletions: 2 })
    expect(result[1]).toEqual(files[1])
  })

  it('matches by relative path when the file path is relative', () => {
    const relativeFiles: ChangedFile[] = [{ path: 'src/a.ts', name: 'a.ts', state: 'accepted' }]
    const status = makeStatus({
      workingTree: { files: [{ path: 'src/a.ts', insertions: 1, deletions: 1, status: 'M' }], insertions: 1, deletions: 1 },
    })
    const result = enrichChangedFilesWithDiffCounts(relativeFiles, status, ROOT)
    expect(result[0]).toEqual({ ...relativeFiles[0], insertions: 1, deletions: 1 })
  })
})
