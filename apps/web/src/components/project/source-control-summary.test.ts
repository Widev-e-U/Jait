import { describe, expect, it } from 'vitest'

import { getSourceControlChangeCount, mergeSourceControlWorkingTreeFiles } from './source-control-summary'

describe('getSourceControlChangeCount', () => {
  it('counts staged and working-tree entries separately', () => {
    expect(getSourceControlChangeCount(
      [{ path: 'src/app.ts', insertions: 1, deletions: 0, status: 'M' }],
      [{ path: 'src/app.ts', status: 'M' }],
    )).toBe(2)
  })

  it('counts merged working-tree entries that are not present in raw git status', () => {
    expect(getSourceControlChangeCount(
      [],
      [
        { path: 'src/new-file.ts', insertions: 0, deletions: 0, status: '?' },
        { path: 'src/other.ts', insertions: 0, deletions: 0, status: 'M' },
      ],
    )).toBe(2)
  })
})

describe('mergeSourceControlWorkingTreeFiles', () => {
  it('does not synthesize staged-only diff entries into working-tree changes', () => {
    const stagedFiles = [
      { path: 'apps/web/src/index.css', insertions: 39, deletions: 61, status: 'M' },
      { path: 'packages/gateway/package.json', insertions: 1, deletions: 1, status: 'M' },
    ]

    expect(mergeSourceControlWorkingTreeFiles(
      [],
      stagedFiles.map((file) => ({
        path: file.path,
        original: 'old',
        modified: 'new',
        status: file.status,
      })),
      stagedFiles,
    )).toEqual([])
  })

  it('keeps real working-tree entries when the same file is staged and modified again', () => {
    const stagedFiles = [
      { path: 'src/app.ts', insertions: 1, deletions: 0, status: 'M' },
    ]
    const workingTreeFiles = [
      { path: 'src/app.ts', insertions: 2, deletions: 1, status: 'M' },
    ]

    expect(mergeSourceControlWorkingTreeFiles(
      workingTreeFiles,
      [{ path: 'src/app.ts', original: 'old', modified: 'new', status: 'M' }],
      stagedFiles,
    )).toEqual(workingTreeFiles)
  })
})
