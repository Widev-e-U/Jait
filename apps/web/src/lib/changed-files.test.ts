import { describe, expect, it } from 'vitest'

import { normalizeChangedFiles } from '@/lib/changed-files'

describe('normalizeChangedFiles', () => {
  it('defaults legacy persisted entries to undecided', () => {
    expect(normalizeChangedFiles([{ path: '/work/app.ts', name: 'app.ts' }])).toEqual([
      { path: '/work/app.ts', name: 'app.ts', state: 'undecided' },
    ])
  })

  it('keeps valid decisions and filters malformed entries', () => {
    expect(normalizeChangedFiles([
      { path: '/work/app.ts', name: 'app.ts', state: 'accepted' },
      { path: '/work/app.ts', name: 'duplicate.ts', state: 'rejected' },
      { path: '', name: 'empty.ts' },
      null,
    ])).toEqual([
      { path: '/work/app.ts', name: 'app.ts', state: 'accepted' },
    ])
  })

  it('preserves valid diff counts', () => {
    expect(normalizeChangedFiles([
      { path: '/work/app.ts', name: 'app.ts', state: 'undecided', insertions: 4, deletions: 2 },
    ])).toEqual([
      { path: '/work/app.ts', name: 'app.ts', state: 'undecided', insertions: 4, deletions: 2 },
    ])
  })
})
