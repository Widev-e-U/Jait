import { describe, expect, it } from 'vitest'

import {
  orderPullRequestRepositories,
  readPullRequestSelection,
  rememberPullRequestRepository,
} from '@/lib/pull-requests-selection-storage'

function createStorage() {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    clear: () => { values.clear() },
  }
  ;(globalThis as Record<string, unknown>).localStorage = storage
  return { values, storage }
}

function restoreWindow() {
  delete (globalThis as Record<string, unknown>).localStorage
}

describe('rememberPullRequestRepository', () => {
  it('moves a selected repository to the front of the recency order', () => {
    createStorage()
    try {
      rememberPullRequestRepository('repo-a')
      rememberPullRequestRepository('repo-b')
      rememberPullRequestRepository('repo-c')
      // Re-selecting an earlier repo bumps it back to the front.
      rememberPullRequestRepository('repo-a')

      const selection = readPullRequestSelection()
      expect(selection.order).toEqual(['repo-a', 'repo-c', 'repo-b'])
      expect(selection.lastSelected).toBe('repo-a')
    } finally {
      restoreWindow()
    }
  })

  it('ignores empty ids and leaves state untouched', () => {
    createStorage()
    try {
      rememberPullRequestRepository('repo-a')
      rememberPullRequestRepository('')
      const selection = readPullRequestSelection()
      expect(selection.order).toEqual(['repo-a'])
      expect(selection.lastSelected).toBe('repo-a')
    } finally {
      restoreWindow()
    }
  })

  it('recovers from corrupted persisted data', () => {
    const { values, storage } = createStorage()
    try {
      values.set('jait.pullRequests.selection.v1', '{not valid json')
      expect(readPullRequestSelection()).toEqual({ order: [], lastSelected: null })

      rememberPullRequestRepository('repo-a')
      expect(storage.getItem('jait.pullRequests.selection.v1')).toContain('repo-a')
    } finally {
      restoreWindow()
    }
  })
})

describe('orderPullRequestRepositories', () => {
  it('returns the input unchanged when nothing has been selected yet', () => {
    createStorage()
    try {
      const repos = [{ id: 'b', name: 'beta' }, { id: 'a', name: 'alpha' }]
      expect(orderPullRequestRepositories(repos)).toEqual(repos)
    } finally {
      restoreWindow()
    }
  })

  it('sorts selected repositories by recency then unselected ones alphabetically', () => {
    createStorage()
    try {
      rememberPullRequestRepository('c')
      rememberPullRequestRepository('a')
      rememberPullRequestRepository('b')

      const repos = [
        { id: 'z', name: 'zulu' },
        { id: 'b', name: 'bravo' },
        { id: 'a', name: 'alpha' },
        { id: 'c', name: 'charlie' },
        { id: 'm', name: 'mike' },
      ]

      expect(orderPullRequestRepositories(repos).map((r) => r.id)).toEqual([
        'b', 'a', 'c', 'm', 'z',
      ])
    } finally {
      restoreWindow()
    }
  })

  it('keeps unselected repositories sorted alphabetically by name', () => {
    createStorage()
    try {
      rememberPullRequestRepository('sel')
      const repos = [
        { id: '3', name: 'zeta' },
        { id: 'sel', name: 'sel' },
        { id: '1', name: 'alpha' },
        { id: '2', name: 'gamma' },
      ]
      expect(orderPullRequestRepositories(repos).map((r) => r.id)).toEqual([
        'sel', '1', '2', '3',
      ])
    } finally {
      restoreWindow()
    }
  })
})
