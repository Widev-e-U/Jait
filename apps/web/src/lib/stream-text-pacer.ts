export interface StreamTextPacerOptions {
  onText: (chunk: string) => void
  onThinking: (chunk: string) => void
  onCommit: () => void
  requestFrame?: (callback: (timestamp: number) => void) => number
  cancelFrame?: (handle: number) => void
  setDeadline?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearDeadline?: (handle: ReturnType<typeof setTimeout>) => void
  deadlineMs?: number
  maxChunkChars?: number
}

export interface StreamTextPacer {
  enqueueText: (text: string) => void
  enqueueThinking: (text: string) => void
  flushNow: () => void
  waitUntilIdle: () => Promise<void>
  cancel: () => void
  isIdle: () => boolean
}

type QueuedChunk =
  | { kind: 'text'; content: string }
  | { kind: 'thinking'; content: string }

export function splitStreamText(text: string, maxChunkChars = 24): string[] {
  if (!text) return []

  const safeMaxChunkChars = Math.max(1, Math.floor(maxChunkChars))
  const parts = text.match(/\S+\s*|\s+/g) ?? [text]
  const chunks: string[] = []
  let current = ''

  const pushCurrent = () => {
    if (!current) return
    chunks.push(current)
    current = ''
  }

  const appendPart = (part: string) => {
    if (current.length + part.length <= safeMaxChunkChars) {
      current += part
      return
    }
    pushCurrent()
    if (part.length <= safeMaxChunkChars) {
      current = part
      return
    }
    for (let index = 0; index < part.length; index += safeMaxChunkChars) {
      chunks.push(part.slice(index, index + safeMaxChunkChars))
    }
  }

  for (const part of parts) appendPart(part)
  pushCurrent()
  return chunks
}

export function createStreamTextPacer(options: StreamTextPacerOptions): StreamTextPacer {
  const requestFrame = options.requestFrame
    ?? ((callback) => window.requestAnimationFrame(callback))
  const cancelFrame = options.cancelFrame
    ?? ((handle) => window.cancelAnimationFrame(handle))
  const setDeadline = options.setDeadline
    ?? ((callback, delayMs) => setTimeout(callback, delayMs))
  const clearDeadline = options.clearDeadline
    ?? ((handle) => clearTimeout(handle))
  const deadlineMs = options.deadlineMs ?? 300
  const maxChunkChars = options.maxChunkChars ?? 24

  const queue: QueuedChunk[] = []
  const idleResolvers = new Set<() => void>()
  let frameHandle: number | null = null
  let deadlineHandle: ReturnType<typeof setTimeout> | null = null
  let hasCommitted = false

  const resolveIdle = () => {
    if (queue.length > 0 || frameHandle !== null || deadlineHandle !== null) return
    for (const resolve of idleResolvers) resolve()
    idleResolvers.clear()
  }

  const cancelScheduled = () => {
    if (frameHandle !== null) {
      cancelFrame(frameHandle)
      frameHandle = null
    }
    if (deadlineHandle !== null) {
      clearDeadline(deadlineHandle)
      deadlineHandle = null
    }
  }

  const drainOne = () => {
    cancelScheduled()
    const next = queue.shift()
    if (!next) {
      resolveIdle()
      return
    }
    if (next.kind === 'text') options.onText(next.content)
    else options.onThinking(next.content)
    hasCommitted = true
    options.onCommit()
    if (queue.length > 0) schedule()
    else resolveIdle()
  }

  const schedule = () => {
    if (queue.length === 0 || frameHandle !== null || deadlineHandle !== null) return
    deadlineHandle = setDeadline(drainOne, deadlineMs)
    frameHandle = requestFrame(() => drainOne())
  }

  const enqueue = (kind: QueuedChunk['kind'], text: string) => {
    for (const chunk of splitStreamText(text, maxChunkChars)) {
      queue.push({ kind, content: chunk })
    }
    if (!hasCommitted) drainOne()
    else schedule()
  }

  const flushNow = () => {
    cancelScheduled()
    while (queue.length > 0) {
      const next = queue.shift()!
      if (next.kind === 'text') options.onText(next.content)
      else options.onThinking(next.content)
      hasCommitted = true
      options.onCommit()
    }
    resolveIdle()
  }

  return {
    enqueueText: (text) => enqueue('text', text),
    enqueueThinking: (text) => enqueue('thinking', text),
    flushNow,
    waitUntilIdle: () => (
      queue.length === 0 && frameHandle === null && deadlineHandle === null
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            idleResolvers.add(resolve)
          })
    ),
    cancel: () => {
      queue.length = 0
      cancelScheduled()
      resolveIdle()
    },
    isIdle: () => queue.length === 0 && frameHandle === null && deadlineHandle === null,
  }
}
