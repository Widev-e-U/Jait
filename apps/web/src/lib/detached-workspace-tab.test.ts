import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDetachedWorkspaceTab,
  loadDetachedWorkspaceTab,
  saveDetachedWorkspaceTab,
  type DetachedWorkspaceTabPayload,
} from './detached-workspace-tab'

const storageMap = new Map<string, string>()

const localStorageMock = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storageMap.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    storageMap.delete(key)
  }),
}

const samplePayload: DetachedWorkspaceTabPayload = {
  id: 'tab-1',
  title: 'Example.ts',
  theme: 'dark',
  createdAt: 123,
  tab: {
    id: 'inner-tab',
    type: 'file',
    path: '/workspace/example.ts',
    label: 'example.ts',
    language: 'typescript',
    content: 'export const value = 1\n',
  },
}

describe('detached-workspace-tab', () => {
  beforeEach(() => {
    storageMap.clear()
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
    localStorageMock.removeItem.mockClear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    })
  })

  it('saves and loads a detached tab payload', () => {
    saveDetachedWorkspaceTab(samplePayload)

    expect(loadDetachedWorkspaceTab(samplePayload.id)).toEqual(samplePayload)
  })

  it('returns null and clears corrupt stored payloads', () => {
    storageMap.set('jait:detached-workspace-tab:broken', '{not-json')

    expect(loadDetachedWorkspaceTab('broken')).toBeNull()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('jait:detached-workspace-tab:broken')
    expect(storageMap.has('jait:detached-workspace-tab:broken')).toBe(false)
  })

  it('swallows storage read and write errors', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('quota exceeded')
    })
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })

    expect(() => saveDetachedWorkspaceTab(samplePayload)).not.toThrow()
    expect(loadDetachedWorkspaceTab(samplePayload.id)).toBeNull()
  })

  it('swallows storage removal errors', () => {
    localStorageMock.removeItem.mockImplementationOnce(() => {
      throw new Error('storage blocked')
    })

    expect(() => clearDetachedWorkspaceTab(samplePayload.id)).not.toThrow()
  })
})
