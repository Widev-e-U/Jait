export interface StreamRenderSchedulerOptions {
  onFlush: () => void
  requestFrame?: (callback: (timestamp: number) => void) => number
  cancelFrame?: (handle: number) => void
  setDeadline?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearDeadline?: (handle: ReturnType<typeof setTimeout>) => void
  deadlineMs?: number
}

export interface StreamRenderScheduler {
  schedule: () => void
  flushNow: () => void
  cancel: () => void
  isScheduled: () => boolean
}

/**
 * Coalesces high-frequency stream mutations into one React commit per paint.
 * A deadline keeps background tabs moving when requestAnimationFrame is paused.
 */
export function createStreamRenderScheduler(
  options: StreamRenderSchedulerOptions,
): StreamRenderScheduler {
  const requestFrame = options.requestFrame
    ?? ((callback) => window.requestAnimationFrame(callback))
  const cancelFrame = options.cancelFrame
    ?? ((handle) => window.cancelAnimationFrame(handle))
  const setDeadline = options.setDeadline
    ?? ((callback, delayMs) => setTimeout(callback, delayMs))
  const clearDeadline = options.clearDeadline
    ?? ((handle) => clearTimeout(handle))
  const deadlineMs = options.deadlineMs ?? 300

  let frameHandle: number | null = null
  let deadlineHandle: ReturnType<typeof setTimeout> | null = null

  const cancelPending = () => {
    if (frameHandle !== null) {
      cancelFrame(frameHandle)
      frameHandle = null
    }
    if (deadlineHandle !== null) {
      clearDeadline(deadlineHandle)
      deadlineHandle = null
    }
  }

  const flushNow = () => {
    cancelPending()
    options.onFlush()
  }

  const schedule = () => {
    if (frameHandle !== null || deadlineHandle !== null) return

    deadlineHandle = setDeadline(() => {
      deadlineHandle = null
      if (frameHandle !== null) {
        cancelFrame(frameHandle)
        frameHandle = null
      }
      options.onFlush()
    }, deadlineMs)

    frameHandle = requestFrame(() => {
      frameHandle = null
      if (deadlineHandle !== null) {
        clearDeadline(deadlineHandle)
        deadlineHandle = null
      }
      options.onFlush()
    })
  }

  return {
    schedule,
    flushNow,
    cancel: cancelPending,
    isScheduled: () => frameHandle !== null || deadlineHandle !== null,
  }
}
