import type { CachedChatHistory } from '@/lib/chat-history-cache'
import { writeCachedStartupChat } from '@/lib/chat-history-cache'

export const STARTUP_CHAT_CACHE_WRITE_INTERVAL_MS = 750

interface StartupChatCacheWrite {
  scope: string
  sessionId: string
  history: Omit<CachedChatHistory, 'updatedAt'>
}

interface StartupChatCacheWriterOptions {
  write?: (scope: string, sessionId: string, history: Omit<CachedChatHistory, 'updatedAt'>) => void
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
  intervalMs?: number
}

export function createStartupChatCacheWriter(options: StartupChatCacheWriterOptions = {}) {
  const write = options.write ?? writeCachedStartupChat
  const setTimer = options.setTimer ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs))
  const clearTimer = options.clearTimer ?? ((handle) => globalThis.clearTimeout(handle))
  const intervalMs = options.intervalMs ?? STARTUP_CHAT_CACHE_WRITE_INTERVAL_MS

  let pending: StartupChatCacheWrite | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastWriteAt: number | null = null
  let lastWriteKey: string | null = null

  const flush = () => {
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }
    const next = pending
    pending = null
    if (!next) return
    write(next.scope, next.sessionId, next.history)
    lastWriteAt = Date.now()
    lastWriteKey = `${next.scope}::${next.sessionId}`
  }

  const schedule = (next: StartupChatCacheWrite) => {
    const nextKey = `${next.scope}::${next.sessionId}`
    if (pending && `${pending.scope}::${pending.sessionId}` !== nextKey) flush()
    pending = next
    if (lastWriteKey !== nextKey || lastWriteAt === null || Date.now() - lastWriteAt >= intervalMs) {
      flush()
      return
    }
    if (timer !== null) return
    timer = setTimer(() => {
      timer = null
      flush()
    }, Math.max(0, intervalMs - (Date.now() - lastWriteAt)))
  }

  const cancel = () => {
    if (timer !== null) clearTimer(timer)
    timer = null
    pending = null
  }

  return { schedule, flush, cancel }
}
