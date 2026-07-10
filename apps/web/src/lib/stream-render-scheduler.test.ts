import { describe, expect, it, vi } from 'vitest'

import { createMessageStream } from '@/lib/message-stream'
import { createStreamRenderScheduler } from '@/lib/stream-render-scheduler'

function createFakeClock() {
  let frameCallback: ((timestamp: number) => void) | null = null
  let deadlineCallback: (() => void) | null = null
  const timeoutHandle = 9 as unknown as ReturnType<typeof setTimeout>

  const requestFrame = vi.fn((callback: (timestamp: number) => void) => {
    frameCallback = callback
    return 7
  })
  const cancelFrame = vi.fn(() => {
    frameCallback = null
  })
  const setDeadline = vi.fn((callback: () => void) => {
    deadlineCallback = callback
    return timeoutHandle
  })
  const clearDeadline = vi.fn(() => {
    deadlineCallback = null
  })

  return {
    requestFrame,
    cancelFrame,
    setDeadline,
    clearDeadline,
    runFrame() {
      const callback = frameCallback
      frameCallback = null
      callback?.(16)
    },
    runDeadline() {
      const callback = deadlineCallback
      deadlineCallback = null
      callback?.()
    },
  }
}

describe('createStreamRenderScheduler', () => {
  it('ingests a burst synchronously and commits its latest snapshot once per frame', () => {
    const clock = createFakeClock()
    const stream = createMessageStream()
    const snapshots: string[] = []
    const scheduler = createStreamRenderScheduler({
      onFlush: () => snapshots.push(stream.snapshot().content),
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      setDeadline: clock.setDeadline,
      clearDeadline: clock.clearDeadline,
    })
    stream.markDirty(scheduler.schedule)

    stream.pushText('one ')
    stream.pushText('two ')
    stream.pushText('three')

    expect(clock.requestFrame).toHaveBeenCalledTimes(1)
    expect(clock.setDeadline).toHaveBeenCalledTimes(1)
    expect(snapshots).toEqual([])

    clock.runFrame()

    expect(snapshots).toEqual(['one two three'])
    expect(scheduler.isScheduled()).toBe(false)

    stream.pushText(' four')
    expect(clock.requestFrame).toHaveBeenCalledTimes(2)
    clock.runFrame()
    expect(snapshots).toEqual(['one two three', 'one two three four'])
  })

  it('flushes ordering boundaries immediately and cancels pending work', () => {
    const clock = createFakeClock()
    const stream = createMessageStream()
    const snapshots: Array<{ content: string; toolCount: number }> = []
    const scheduler = createStreamRenderScheduler({
      onFlush: () => {
        const snapshot = stream.snapshot()
        snapshots.push({ content: snapshot.content, toolCount: snapshot.toolCalls.length })
      },
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      setDeadline: clock.setDeadline,
      clearDeadline: clock.clearDeadline,
    })
    stream.markDirty(scheduler.schedule)

    stream.pushText('before tool')
    scheduler.flushNow()
    stream.pushToolStart('call-1', 'file.read', { path: 'README.md' })
    scheduler.flushNow()

    expect(snapshots).toEqual([
      { content: 'before tool', toolCount: 0 },
      { content: 'before tool', toolCount: 1 },
    ])
    expect(clock.cancelFrame).toHaveBeenCalledTimes(2)
    expect(clock.clearDeadline).toHaveBeenCalledTimes(2)
    expect(scheduler.isScheduled()).toBe(false)
  })

  it('uses the deadline when animation frames are paused', () => {
    const clock = createFakeClock()
    const onFlush = vi.fn()
    const scheduler = createStreamRenderScheduler({
      onFlush,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      setDeadline: clock.setDeadline,
      clearDeadline: clock.clearDeadline,
      deadlineMs: 300,
    })

    scheduler.schedule()
    clock.runDeadline()

    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(clock.cancelFrame).toHaveBeenCalledWith(7)
    expect(scheduler.isScheduled()).toBe(false)
  })

  it('cancels without flushing during teardown', () => {
    const clock = createFakeClock()
    const onFlush = vi.fn()
    const scheduler = createStreamRenderScheduler({
      onFlush,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      setDeadline: clock.setDeadline,
      clearDeadline: clock.clearDeadline,
    })

    scheduler.schedule()
    scheduler.cancel()
    clock.runFrame()
    clock.runDeadline()

    expect(onFlush).not.toHaveBeenCalled()
    expect(scheduler.isScheduled()).toBe(false)
  })
})
