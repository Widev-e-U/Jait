import { describe, expect, it } from 'vitest'

import { getSourceControlChangeCount } from './source-control-summary'

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
        { path: 'src/new-file.ts', status: '?' },
        { path: 'src/other.ts', status: 'M' },
      ],
    )).toBe(2)
  })
})
