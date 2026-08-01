import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/hooks/useChat'
import {
  CHAT_HISTORY_CACHE_MESSAGE_LIMIT,
  CHAT_HISTORY_CACHE_RETENTION_MS,
  INITIAL_CHAT_HISTORY_MESSAGE_LIMIT,
  STARTUP_CHAT_CACHE_MESSAGE_LIMIT,
  getChatCacheScope,
  isChatCacheFresh,
  prepareChatHistoryForCache,
  readCachedStartupChat,
  readCachedProjectIndex,
  reconcileChatHistory,
  reuseUnchangedMessages,
  selectImmediateChatHistory,
  writeCachedProjectIndex,
  writeCachedStartupChat,
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
    get length() { return values.size },
    key: (index: number) => [...values.keys()][index] ?? null,
  }
}

// Simulates a full localStorage quota: writes fail once the number of
// distinct keys reaches `limit`, matching how a real QuotaExceededError
// blocks all further writes until something is evicted.
function createQuotaLimitedStorage(limit: number) {
  const storage = createStorage()
  return {
    values: storage.values,
    getItem: storage.getItem,
    removeItem: storage.removeItem,
    key: storage.key,
    get length() { return storage.length },
    setItem: (key: string, value: string) => {
      if (!storage.values.has(key) && storage.values.size >= limit) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }
      storage.values.set(key, value)
    },
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

describe('startup chat cache', () => {
  it('restores the latest messages synchronously and keeps pagination metadata', () => {
    const storage = createStorage()
    const messages = Array.from({ length: STARTUP_CHAT_CACHE_MESSAGE_LIMIT + 2 }, (_, index) => message(String(index)))

    writeCachedStartupChat('gateway::user-1', 'session-1', {
      messages,
      hasMore: false,
      totalMessages: messages.length,
      streaming: true,
    }, storage)

    const cached = readCachedStartupChat('gateway::user-1', 'session-1', storage)
    expect(cached?.messages).toHaveLength(STARTUP_CHAT_CACHE_MESSAGE_LIMIT)
    expect(cached?.messages[0]?.id).toBe('2')
    expect(cached?.hasMore).toBe(true)
    expect(cached?.totalMessages).toBe(messages.length)
    expect(cached?.streaming).toBe(true)
  })

  it('keeps an empty assistant placeholder while generation is active', () => {
    const storage = createStorage()
    const messages: ChatMessage[] = [
      { id: 'user', role: 'user', content: 'hello' },
      { id: 'assistant', role: 'assistant', content: '' },
    ]

    writeCachedStartupChat('gateway::user-1', 'session-1', {
      messages,
      hasMore: false,
      totalMessages: messages.length,
      streaming: true,
    }, storage)

    expect(readCachedStartupChat('gateway::user-1', 'session-1', storage)?.messages.at(-1)).toEqual(messages[1])
  })

  it('does not paint an older or incomplete snapshot during a project switch', () => {
    const completedCache = {
      messages: [message('cached')],
      hasMore: false,
      totalMessages: 1,
      updatedAt: Date.UTC(2026, 6, 23, 10, 0, 0),
      sessionLastActiveAt: '2026-07-23T09:59:00.000Z',
    }
    const streamingCache = {
      ...completedCache,
      streaming: true,
      sessionLastActiveAt: '2026-07-23T10:01:00.000Z',
    }

    expect(selectImmediateChatHistory(completedCache, '2026-07-23T10:01:00.000Z')).toBeNull()
    expect(selectImmediateChatHistory(streamingCache, '2026-07-23T10:01:00.000Z')).toBeNull()
    expect(selectImmediateChatHistory(completedCache, completedCache.sessionLastActiveAt)).toBe(completedCache)
  })

  it('restores only the initial window from an oversized legacy cache', () => {
    const messages = Array.from(
      { length: INITIAL_CHAT_HISTORY_MESSAGE_LIMIT + 3 },
      (_, index) => message(String(index)),
    )

    const selected = selectImmediateChatHistory({
      messages,
      hasMore: false,
      totalMessages: messages.length,
      updatedAt: Date.UTC(2026, 6, 23, 10, 0, 0),
    })

    expect(selected?.messages).toHaveLength(INITIAL_CHAT_HISTORY_MESSAGE_LIMIT)
    expect(selected?.messages[0]?.id).toBe('3')
    expect(selected?.hasMore).toBe(true)
    expect(selected?.totalMessages).toBe(messages.length)
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

describe('reuseUnchangedMessages', () => {
  it('preserves object identity for messages whose content is unchanged', () => {
    const prev = [message('0'), message('1'), message('2')]
    // A fresh snapshot fetch always parses brand-new objects, even when the
    // underlying content is identical (e.g. a focus-triggered re-subscribe).
    const next = [message('0'), message('1'), message('2')]

    const result = reuseUnchangedMessages(next, prev)

    expect(result).toBe(prev)
    expect(result[0]).toBe(prev[0])
    expect(result[1]).toBe(prev[1])
    expect(result[2]).toBe(prev[2])
  })

  it('only replaces the object reference for messages that actually changed', () => {
    const prev = [message('0'), message('1'), message('2')]
    const next = [message('0'), message('1', 'edited-1'), message('2')]

    const result = reuseUnchangedMessages(next, prev)

    expect(result).not.toBe(prev)
    expect(result[0]).toBe(prev[0])
    expect(result[1]).toBe(next[1])
    expect(result[1].content).toBe('edited-1')
    expect(result[2]).toBe(prev[2])
  })

  it('detects changes in tool calls and segments beyond plain content', () => {
    const prev = [{ ...message('0'), toolCalls: [{ callId: 'a', tool: 'read', args: {}, status: 'success' as const }] }]
    const next = [{ ...message('0'), toolCalls: [{ callId: 'a', tool: 'read', args: {}, status: 'running' as const }] }]

    const result = reuseUnchangedMessages(next, prev)

    expect(result[0]).toBe(next[0])
  })

  it('returns the new array as-is when there is no previous history to compare against', () => {
    const next = [message('0'), message('1')]
    expect(reuseUnchangedMessages(next, [])).toBe(next)
  })

  it('trusts historical messages by id without deep-comparing far outside the tail', () => {
    // A long, fully-settled session: everything except the last few messages
    // is an immutable persisted row. Those should be reused by id alone
    // (cheap), while the tail still gets the full content diff.
    const prev = Array.from({ length: 40 }, (_, i) => message(String(i)))
    const next = Array.from({ length: 40 }, (_, i) => message(String(i)))

    const result = reuseUnchangedMessages(next, prev)

    // Historical (pre-tail) messages: reused by reference even though they
    // are distinct objects, without needing content equality to hold.
    expect(result[0]).toBe(prev[0])
    expect(result[27]).toBe(prev[27])
    // Tail messages: still content-compared and reused since unchanged.
    expect(result[39]).toBe(prev[39])
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

  it('survives a full quota by pruning expired startup-chat snapshots before retrying', () => {
    const now = Date.UTC(2026, 6, 27)
    const storage = createQuotaLimitedStorage(2)
    // Fill the "quota" with stale startup-chat snapshots nobody has read
    // recently — nothing ever swept these proactively before this fix.
    storage.values.set(
      'jait:startup-chat:v1:gateway%3A%3Auser-1%3A%3Aold-session',
      JSON.stringify({ messages: [{ id: 'm1' }], hasMore: false, totalMessages: 1, updatedAt: now - CHAT_HISTORY_CACHE_RETENTION_MS - 1000 }),
    )
    storage.values.set('other-app-key', 'unrelated')

    const cache = {
      projects: [{ id: 'project-1' }],
      personalSessions: [],
      activeProjectId: 'project-1',
      activeSessionId: 'session-1',
      hasMoreProjects: false,
    }

    writeCachedProjectIndex('gateway::user-1', cache, storage, now)

    expect(readCachedProjectIndex('gateway::user-1', storage, now)).toMatchObject(cache)
    expect(storage.values.has('other-app-key')).toBe(true)
  })

  it('survives a full quota by evicting startup-chat snapshots outright when none have expired yet', () => {
    const now = Date.UTC(2026, 6, 27)
    const storage = createQuotaLimitedStorage(2)
    // Two fresh (not-yet-expired) startup-chat snapshots leave no room for
    // the project index write; pruning expired entries alone can't help.
    storage.values.set('jait:startup-chat:v1:a', JSON.stringify({ messages: [{ id: 'm1' }], hasMore: false, totalMessages: 1, updatedAt: now }))
    storage.values.set('jait:startup-chat:v1:b', JSON.stringify({ messages: [{ id: 'm1' }], hasMore: false, totalMessages: 1, updatedAt: now }))

    const cache = {
      projects: [{ id: 'project-1' }],
      personalSessions: [],
      activeProjectId: 'project-1',
      activeSessionId: 'session-1',
      hasMoreProjects: false,
    }

    // Without recovery this write would silently vanish, freezing the
    // locally cached active project at whatever was written last.
    writeCachedProjectIndex('gateway::user-1', cache, storage, now)

    expect(readCachedProjectIndex('gateway::user-1', storage, now)).toMatchObject(cache)
  })
})
