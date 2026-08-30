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
  /** Target number of animation frames to fully drain the queued backlog. */
  catchUpFrames?: number
  /** Hard cap on chunks dispatched within a single frame/budget drain. */
  maxChunksPerFrame?: number
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
  // Hidden tabs stop firing rAF, so `token` events keep enqueueing while the
  // queue never drains. Returning to the tab must not replay that backlog one
  // 24-char chunk (and one synchronous React render) per frame — that is
  // minutes of catch-up for a turn that streamed for a minute. Instead each
  // drain dispatches a backlog-proportional budget sized to fully catch up
  // within `catchUpFrames` frames (~0.75s at 60fps), capped so a single
  // frame's work stays bounded no matter how deeply the queue backed up.
  const catchUpFrames = Math.max(1, options.catchUpFrames ?? 45)
  const maxChunksPerFrame = Math.max(1, options.maxChunksPerFrame ?? 400)

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

  const nextBudget = (): number =>
    Math.min(maxChunksPerFrame, Math.max(1, Math.ceil(queue.length / catchUpFrames)))

  const dispatch = (budget: number): number => {
    let dispatched = 0
    while (queue.length > 0 && dispatched < budget) {
      const next = queue.shift()!
      if (next.kind === 'text') options.onText(next.content)
      else options.onThinking(next.content)
      dispatched += 1
    }
    // The consumer's state is cumulative — every callback appends into the same
    // pending snapshot — so committing once after the whole budget renders
    // exactly the same content as committing per chunk, minus `budget - 1`
    // synchronous renders jammed into a single frame.
    if (dispatched > 0) {
      hasCommitted = true
      options.onCommit()
    }
    return dispatched
  }

  const drain = () => {
    cancelScheduled()
    if (dispatch(nextBudget()) === 0 && queue.length === 0) {
      resolveIdle()
      return
    }
    if (queue.length > 0) schedule()
    else resolveIdle()
  }

  const schedule = () => {
    if (queue.length === 0 || frameHandle !== null || deadlineHandle !== null) return
    deadlineHandle = setDeadline(drain, deadlineMs)
    frameHandle = requestFrame(() => drain())
  }

  const enqueue = (kind: QueuedChunk['kind'], text: string) => {
    for (const chunk of splitStreamText(text, maxChunkChars)) {
      queue.push({ kind, content: chunk })
    }
    // Begin typing with the first chunk synchronously so the bubble does not
    // wait a frame; afterwards everything rides the frame/throttle drain.
    if (!hasCommitted) drain()
    else schedule()
  }

  const flushNow = () => {
    cancelScheduled()
    dispatch(queue.length)
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
