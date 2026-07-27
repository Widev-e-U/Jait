import type { ChatMessage } from '@/hooks/useChat'

export const CHAT_HISTORY_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
export const CHAT_HISTORY_CACHE_MESSAGE_LIMIT = 500

const CHAT_HISTORY_DATABASE_NAME = 'jait-chat-history-cache'
const CHAT_HISTORY_DATABASE_VERSION = 1
const CHAT_HISTORY_STORE_NAME = 'chat-history'
const PROJECT_INDEX_STORAGE_PREFIX = 'jait:project-index:v1:'
const STARTUP_CHAT_STORAGE_PREFIX = 'jait:startup-chat:v1:'
export const STARTUP_CHAT_CACHE_MESSAGE_LIMIT = 120
const CHAT_HISTORY_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000

let lastChatHistoryPruneAt = 0
let lastLocalCachePruneAt = 0

type PruneableLocalStorage = Pick<Storage, 'getItem' | 'removeItem' | 'length' | 'key'>

function collectStartupChatKeys(storage: PruneableLocalStorage): string[] {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && key.startsWith(STARTUP_CHAT_STORAGE_PREFIX)) keys.push(key)
  }
  return keys
}

// Startup-chat snapshots are written per session and, unlike the IndexedDB
// chat history store, were never swept as a batch — only lazily on a read of
// that exact key. On accounts with many sessions this silently fills the
// origin's localStorage quota over weeks, and every write past that point
// (including the active project/session selection) throws and is dropped,
// freezing "last selected project" at whatever was cached before the quota
// was hit.
function pruneExpiredStartupChatEntries(storage: PruneableLocalStorage, now: number): void {
  for (const key of collectStartupChatKeys(storage)) {
    try {
      const cached = JSON.parse(storage.getItem(key) ?? 'null') as CachedChatHistory | null
      if (!cached || !isChatCacheFresh(cached.updatedAt, now)) storage.removeItem(key)
    } catch {
      storage.removeItem(key)
    }
  }
}

function maybePruneExpiredStartupChatEntries(storage: PruneableLocalStorage, now: number): void {
  if (now - lastLocalCachePruneAt < CHAT_HISTORY_PRUNE_INTERVAL_MS) return
  lastLocalCachePruneAt = now
  pruneExpiredStartupChatEntries(storage, now)
}

// Writes that matter for correctness (active project/session selection) must
// not silently vanish just because the quota is exhausted by expired
// snapshots. Retry after forced pruning, then after evicting snapshots
// outright, before giving up.
function setItemWithQuotaRecovery(
  storage: Pick<Storage, 'setItem'> & PruneableLocalStorage,
  key: string,
  value: string,
  now: number,
): void {
  try {
    storage.setItem(key, value)
    return
  } catch {
    // fall through to recovery below
  }
  pruneExpiredStartupChatEntries(storage, now)
  try {
    storage.setItem(key, value)
    return
  } catch {
    // still over quota after clearing expired entries — fall through
  }
  for (const staleKey of collectStartupChatKeys(storage)) {
    storage.removeItem(staleKey)
    try {
      storage.setItem(key, value)
      return
    } catch {
      continue
    }
  }
  console.warn('[jait] local cache write failed even after evicting cached chat snapshots; storage quota may be exhausted', key)
}

export interface CachedChatHistory {
  messages: ChatMessage[]
  hasMore: boolean
  totalMessages: number
  updatedAt: number
  streaming?: boolean
  sessionLastActiveAt?: string | null
}

interface StoredChatHistory extends CachedChatHistory {
  key: string
  scope: string
  sessionId: string
  lastAccessedAt: number
}

export interface CachedProjectIndex<Project, Session> {
  projects: Project[]
  personalSessions: Session[]
  activeProjectId: string | null
  activeSessionId: string | null
  hasMoreProjects: boolean
  updatedAt: number
}

function decodeJwtSubject(token: string): string | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = JSON.parse(globalThis.atob(padded)) as { sub?: unknown }
    return typeof decoded.sub === 'string' && decoded.sub.length > 0 ? decoded.sub : null
  } catch {
    return null
  }
}

export function getChatCacheScope(
  token?: string | null,
  apiUrl = '',
  origin = typeof window !== 'undefined' ? window.location.origin : '',
): string | null {
  if (!token) return null
  const subject = decodeJwtSubject(token)
  if (!subject) return null
  try {
    const gatewayUrl = new URL(apiUrl || '/', origin || 'http://localhost')
    gatewayUrl.hash = ''
    gatewayUrl.search = ''
    return `${gatewayUrl.href.replace(/\/$/, '')}::${subject}`
  } catch {
    return null
  }
}

export function isChatCacheFresh(updatedAt: number, now = Date.now()): boolean {
  return Number.isFinite(updatedAt)
    && updatedAt > 0
    && now - updatedAt <= CHAT_HISTORY_CACHE_RETENTION_MS
}

export function selectImmediateChatHistory(
  cached: CachedChatHistory | null,
  sessionLastActiveAt?: string | null,
): CachedChatHistory | null {
  if (!cached || cached.streaming === true) return null
  if (sessionLastActiveAt && cached.sessionLastActiveAt !== sessionLastActiveAt) return null
  return cached
}

export function prepareChatHistoryForCache(
  messages: ChatMessage[],
  hasMore: boolean,
  totalMessages: number,
  updatedAt = Date.now(),
  preserveEmptyAssistant = false,
): CachedChatHistory {
  const stableMessages = messages
    .filter((message) => !message.optimistic)
    .filter((message, index, source) => {
      if (index !== source.length - 1 || message.role !== 'assistant' || preserveEmptyAssistant) return true
      return Boolean(message.content || message.thinking || message.toolCalls?.length || message.segments?.length)
    })
    .slice(-CHAT_HISTORY_CACHE_MESSAGE_LIMIT)
    .map((message) => {
      const { contextFlow: _contextFlow, ...cacheableMessage } = message
      if (cacheableMessage.displaySegments?.length) {
        return { ...cacheableMessage, attachments: undefined }
      }
      return cacheableMessage
    })
  const normalizedTotal = Math.max(totalMessages, stableMessages.length)
  return {
    messages: stableMessages,
    hasMore: hasMore || stableMessages.length < normalizedTotal,
    totalMessages: normalizedTotal,
    updatedAt,
  }
}

export function reconcileChatHistory(
  cachedMessages: ChatMessage[],
  snapshotMessages: ChatMessage[],
  totalMessages: number,
): ChatMessage[] {
  if (snapshotMessages.length === 0 || totalMessages <= 0) return []
  if (cachedMessages.length === 0) return snapshotMessages.slice(-totalMessages)

  const cachedIndexById = new Map(cachedMessages.map((message, index) => [message.id, index]))
  const firstOverlap = snapshotMessages.find((message) => cachedIndexById.has(message.id))
  if (!firstOverlap) return snapshotMessages.slice(-totalMessages)

  const cachedOverlapIndex = cachedIndexById.get(firstOverlap.id) ?? 0
  const reconciled = [
    ...cachedMessages.slice(0, cachedOverlapIndex),
    ...snapshotMessages,
  ]
  return reconciled.slice(-totalMessages)
}

function chatMessageContentEqual(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.role === b.role
    && a.content === b.content
    && a.thinking === b.thinking
    && a.thinkingDuration === b.thinkingDuration
    && a.hasContextFlow === b.hasContextFlow
    && a.hasMemoryProvenance === b.hasMemoryProvenance
    && a.optimistic === b.optimistic
    && JSON.stringify(a.toolCalls) === JSON.stringify(b.toolCalls)
    && JSON.stringify(a.segments) === JSON.stringify(b.segments)
    && JSON.stringify(a.displaySegments) === JSON.stringify(b.displaySegments)
    && JSON.stringify(a.attachments) === JSON.stringify(b.attachments)
    && JSON.stringify(a.referencedFiles) === JSON.stringify(b.referencedFiles)
    && JSON.stringify(a.contextFlow) === JSON.stringify(b.contextFlow)
  )
}

/**
 * A fresh snapshot fetch (e.g. re-subscribing on window focus) always parses
 * brand-new message/toolCall/segment objects, even when nothing actually
 * changed server-side. Passing those straight to setState defeats the
 * per-message render cache in developer-chat-workspace.tsx (which skips
 * rebuilding a <Message> only when its fields are reference-equal), so every
 * message re-renders and the transcript visibly jiggles on refocus even
 * though nothing changed. Reuse the previous object whenever its content is
 * equivalent so unaffected messages keep stable references.
 *
 * Only the tail of the conversation can still be mutating (an in-flight
 * stream, or a retry-tool call, which always targets the most recent
 * assistant message). Everything further back is an immutable persisted row,
 * so those are reused by id without paying for a deep JSON.stringify diff of
 * potentially large toolCalls/segments payloads. Without this, every snapshot
 * (including the one right after opening a cached session) re-diffs the
 * entire loaded history on the main thread — the more history a session
 * accumulates, the slower every chat open and reconnect gets.
 */
const DEEP_COMPARE_TAIL_SIZE = 12

export function reuseUnchangedMessages(next: ChatMessage[], prev: ChatMessage[]): ChatMessage[] {
  if (prev.length === 0) return next
  const prevById = new Map(prev.map((message) => [message.id, message]))
  const tailStart = Math.max(0, next.length - DEEP_COMPARE_TAIL_SIZE)
  const merged = next.map((message, index) => {
    const prior = prevById.get(message.id)
    if (!prior) return message
    if (index < tailStart) return prior
    return chatMessageContentEqual(prior, message) ? prior : message
  })
  if (merged.length === prev.length && merged.every((message, index) => message === prev[index])) {
    return prev
  }
  return merged
}

function chatHistoryKey(scope: string, sessionId: string): string {
  return `${scope}::${sessionId}`
}

function startupChatStorageKey(scope: string, sessionId: string): string {
  return `${STARTUP_CHAT_STORAGE_PREFIX}${encodeURIComponent(chatHistoryKey(scope, sessionId))}`
}

export function readCachedStartupChat(
  scope: string | null,
  sessionId: string,
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
  now = Date.now(),
): CachedChatHistory | null {
  if (!scope || !sessionId || !storage) return null
  const key = startupChatStorageKey(scope, sessionId)
  try {
    const cached = JSON.parse(storage.getItem(key) ?? 'null') as CachedChatHistory | null
    if (!cached || !Array.isArray(cached.messages) || !isChatCacheFresh(cached.updatedAt, now)) {
      storage.removeItem(key)
      return null
    }
    return cached
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function writeCachedStartupChat(
  scope: string | null,
  sessionId: string,
  history: Omit<CachedChatHistory, 'updatedAt'>,
  storage: (Pick<Storage, 'setItem'> & PruneableLocalStorage) | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!scope || !sessionId || !storage || history.messages.length === 0) return
  const now = Date.now()
  maybePruneExpiredStartupChatEntries(storage, now)
  try {
    const prepared = prepareChatHistoryForCache(
      history.messages,
      history.hasMore,
      history.totalMessages,
      now,
      history.streaming === true,
    )
    setItemWithQuotaRecovery(storage, startupChatStorageKey(scope, sessionId), JSON.stringify({
      ...prepared,
      streaming: history.streaming === true,
      sessionLastActiveAt: history.sessionLastActiveAt ?? null,
      messages: prepared.messages.slice(-STARTUP_CHAT_CACHE_MESSAGE_LIMIT),
      hasMore: prepared.hasMore || prepared.messages.length > STARTUP_CHAT_CACHE_MESSAGE_LIMIT,
    }), now)
  } catch {
    // Startup cache writes are best-effort and must never interrupt chat rendering.
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
}

async function openChatHistoryDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CHAT_HISTORY_DATABASE_NAME, CHAT_HISTORY_DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(CHAT_HISTORY_STORE_NAME)) {
        const store = database.createObjectStore(CHAT_HISTORY_STORE_NAME, { keyPath: 'key' })
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open chat history cache'))
    request.onblocked = () => resolve(null)
  })
}

async function pruneExpiredChatHistory(database: IDBDatabase, now: number): Promise<void> {
  if (now - lastChatHistoryPruneAt < CHAT_HISTORY_PRUNE_INTERVAL_MS) return
  lastChatHistoryPruneAt = now
  const transaction = database.transaction(CHAT_HISTORY_STORE_NAME, 'readwrite')
  const completion = transactionComplete(transaction)
  const request = transaction
    .objectStore(CHAT_HISTORY_STORE_NAME)
    .index('updatedAt')
    .openCursor(IDBKeyRange.upperBound(now - CHAT_HISTORY_CACHE_RETENTION_MS))
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }
      cursor.delete()
      cursor.continue()
    }
    request.onerror = () => reject(request.error ?? new Error('Unable to prune chat history cache'))
  })
  await completion
}

async function deleteStoredChatHistory(database: IDBDatabase, key: string): Promise<void> {
  const transaction = database.transaction(CHAT_HISTORY_STORE_NAME, 'readwrite')
  transaction.objectStore(CHAT_HISTORY_STORE_NAME).delete(key)
  await transactionComplete(transaction)
}

export async function readCachedChatHistory(
  scope: string | null,
  sessionId: string,
  now = Date.now(),
): Promise<CachedChatHistory | null> {
  if (!scope || !sessionId) return null
  try {
    const database = await openChatHistoryDatabase()
    if (!database) return null
    await pruneExpiredChatHistory(database, now)
    const key = chatHistoryKey(scope, sessionId)
    const transaction = database.transaction(CHAT_HISTORY_STORE_NAME, 'readonly')
    const stored = await requestResult(
      transaction.objectStore(CHAT_HISTORY_STORE_NAME).get(key) as IDBRequest<StoredChatHistory | undefined>,
    )
    if (!stored || stored.scope !== scope || stored.sessionId !== sessionId) return null
    if (!isChatCacheFresh(stored.updatedAt, now)) {
      await deleteStoredChatHistory(database, key)
      return null
    }
    return {
      messages: stored.messages,
      hasMore: stored.hasMore,
      totalMessages: stored.totalMessages,
      updatedAt: stored.updatedAt,
      sessionLastActiveAt: stored.sessionLastActiveAt ?? null,
    }
  } catch {
    return null
  }
}

export async function writeCachedChatHistory(
  scope: string | null,
  sessionId: string,
  history: Omit<CachedChatHistory, 'updatedAt'>,
): Promise<void> {
  if (!scope || !sessionId || history.messages.length === 0) return
  try {
    const database = await openChatHistoryDatabase()
    if (!database) return
    const now = Date.now()
    await pruneExpiredChatHistory(database, now)
    const prepared = prepareChatHistoryForCache(
      history.messages,
      history.hasMore,
      history.totalMessages,
      now,
    )
    if (prepared.messages.length === 0) return
    const transaction = database.transaction(CHAT_HISTORY_STORE_NAME, 'readwrite')
    transaction.objectStore(CHAT_HISTORY_STORE_NAME).put({
      ...prepared,
      sessionLastActiveAt: history.sessionLastActiveAt ?? null,
      key: chatHistoryKey(scope, sessionId),
      scope,
      sessionId,
      lastAccessedAt: now,
    } satisfies StoredChatHistory)
    await transactionComplete(transaction)
  } catch {
    // Cache writes are best-effort and must never interrupt chat rendering.
  }
}

export async function deleteCachedChatHistory(scope: string | null, sessionId: string): Promise<void> {
  if (!scope || !sessionId) return
  try {
    const database = await openChatHistoryDatabase()
    if (!database) return
    await deleteStoredChatHistory(database, chatHistoryKey(scope, sessionId))
  } catch {
    // Cache deletion is best-effort.
  }
}

function projectIndexStorageKey(scope: string): string {
  return `${PROJECT_INDEX_STORAGE_PREFIX}${encodeURIComponent(scope)}`
}

export function readCachedProjectIndex<Project, Session>(
  scope: string | null,
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
  now = Date.now(),
): CachedProjectIndex<Project, Session> | null {
  if (!scope || !storage) return null
  const key = projectIndexStorageKey(scope)
  try {
    const cached = JSON.parse(storage.getItem(key) ?? 'null') as CachedProjectIndex<Project, Session> | null
    if (!cached || !Array.isArray(cached.projects) || !Array.isArray(cached.personalSessions)) return null
    if (!isChatCacheFresh(cached.updatedAt, now)) {
      storage.removeItem(key)
      return null
    }
    return cached
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function writeCachedProjectIndex<Project, Session>(
  scope: string | null,
  cache: Omit<CachedProjectIndex<Project, Session>, 'updatedAt'>,
  storage: (Pick<Storage, 'setItem'> & PruneableLocalStorage) | null = typeof localStorage !== 'undefined' ? localStorage : null,
  now = Date.now(),
): void {
  if (!scope || !storage) return
  maybePruneExpiredStartupChatEntries(storage, now)
  setItemWithQuotaRecovery(storage, projectIndexStorageKey(scope), JSON.stringify({ ...cache, updatedAt: now }), now)
}
