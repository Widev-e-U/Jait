import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/hooks/useChat'
import {
  CHAT_HISTORY_CACHE_MESSAGE_LIMIT,
  CHAT_HISTORY_CACHE_RETENTION_MS,
  getChatCacheScope,
  isChatCacheFresh,
  prepareChatHistoryForCache,
  readCachedProjectIndex,
  reconcileChatHistory,
  writeCachedProjectIndex,
} from '@/lib/chat-history-cache'

function createToken(subject?: string): string {
  const payload = globalThis.btoa(JSON.stringify(subject ? { sub: subject } : {}))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `header.${payload}.signature`
}

function message(id: string, content = id): ChatMessage {
  return { id, role: 'assistant', content }
}

function createStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('getChatCacheScope', () => {
  it('isolates caches by gateway and authenticated user', () => {
    const token = createToken('user-1')
    expect(getChatCacheScope(token, '/gateway', 'https://jait.example')).toBe(
      'https://jait.example/gateway::user-1',
    )
    expect(getChatCacheScope(createToken('user-2'), '/gateway', 'https://jait.example')).not.toBe(
      getChatCacheScope(token, '/gateway', 'https://jait.example'),
    )
    expect(getChatCacheScope(token, '/gateway', 'https://other.example')).not.toBe(
      getChatCacheScope(token, '/gateway', 'https://jait.example'),
    )
  })

  it('does not cache unauthenticated or unscoped tokens', () => {
    expect(getChatCacheScope(null)).toBeNull()
    expect(getChatCacheScope(createToken())).toBeNull()
    expect(getChatCacheScope('invalid-token')).toBeNull()
  })
})

describe('chat history retention', () => {
  it('keeps entries for 30 days and expires older entries', () => {
    const now = Date.UTC(2026, 6, 18)
    expect(isChatCacheFresh(now - CHAT_HISTORY_CACHE_RETENTION_MS, now)).toBe(true)
    expect(isChatCacheFresh(now - CHAT_HISTORY_CACHE_RETENTION_MS - 1, now)).toBe(false)
  })

  it('bounds cached history and removes unstable or redundant payloads', () => {
    const contextFlow = { provider: 'test', rounds: [] }
    const messages: ChatMessage[] = [
      {
        id: 'optimistic',
        role: 'user',
        content: 'pending',
        optimistic: true,
      },
      ...Array.from({ length: CHAT_HISTORY_CACHE_MESSAGE_LIMIT + 5 }, (_, index) => message(`message-${index}`)),
      {
        id: 'user-with-image',
        role: 'user',
        content: 'image',
        contextFlow,
        displaySegments: [{ type: 'text', text: 'image' }],
        attachments: [{ name: 'image.png', mimeType: 'image/png', data: 'base64', preview: 'data:image/png;base64,base64' }],
      },
      { id: 'empty-assistant', role: 'assistant', content: '' },
    ]

    const cached = prepareChatHistoryForCache(messages, false, messages.length, 123)

    expect(cached.messages).toHaveLength(CHAT_HISTORY_CACHE_MESSAGE_LIMIT)
    expect(cached.messages.some((entry) => entry.id === 'optimistic')).toBe(false)
    expect(cached.messages.some((entry) => entry.id === 'empty-assistant')).toBe(false)
    expect(cached.messages.at(-1)).toMatchObject({ id: 'user-with-image' })
    expect(cached.messages.at(-1)?.attachments).toBeUndefined()
    expect(cached.messages.at(-1)).not.toHaveProperty('contextFlow')
    expect(cached.hasMore).toBe(true)
    expect(cached.updatedAt).toBe(123)
  })
})

describe('reconcileChatHistory', () => {
  it('keeps cached older history while replacing the overlapping server window', () => {
    const cached = ['0', '1', '2', '3', '4'].map((id) => message(id))
    const snapshot = [message('3', 'updated-3'), message('4', 'updated-4'), message('5', 'new-5')]

    expect(reconcileChatHistory(cached, snapshot, 6)).toEqual([
      message('0'),
      message('1'),
      message('2'),
      message('3', 'updated-3'),
      message('4', 'updated-4'),
      message('5', 'new-5'),
    ])
  })

  it('drops stale history after truncation or when no overlap can be proven', () => {
    const cached = ['0', '1', '2', '3'].map((id) => message(id))
    expect(reconcileChatHistory(cached, [message('0', 'edited'), message('1', 'new')], 2)).toEqual([
      message('0', 'edited'),
      message('1', 'new'),
    ])
    expect(reconcileChatHistory(cached, [message('8'), message('9')], 10)).toEqual([
      message('8'),
      message('9'),
    ])
  })
})

describe('project index cache', () => {
  it('restores a fresh index only for the matching scope', () => {
    const storage = createStorage()
    const cache = {
      projects: [{ id: 'project-1' }],
      personalSessions: [{ id: 'session-1' }],
      activeProjectId: 'project-1',
      activeSessionId: 'session-1',
      hasMoreProjects: true,
    }

    writeCachedProjectIndex('gateway::user-1', cache, storage)

    expect(readCachedProjectIndex('gateway::user-1', storage)).toMatchObject(cache)
    expect(readCachedProjectIndex('gateway::user-2', storage)).toBeNull()
  })

  it('removes an expired project index', () => {
    const storage = createStorage()
    writeCachedProjectIndex('gateway::user-1', {
      projects: [],
      personalSessions: [],
      activeProjectId: null,
      activeSessionId: null,
      hasMoreProjects: false,
    }, storage)
    const [key, raw] = [...storage.values.entries()][0]!
    storage.values.set(key, JSON.stringify({
      ...JSON.parse(raw),
      updatedAt: 1,
    }))

    expect(readCachedProjectIndex('gateway::user-1', storage, CHAT_HISTORY_CACHE_RETENTION_MS + 2)).toBeNull()
    expect(storage.values.has(key)).toBe(false)
  })
})
