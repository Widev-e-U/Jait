import { afterEach, describe, expect, it, vi } from 'vitest'
import { emitPreviewSession, subscribePreviewSession } from './preview-events'

describe('preview-events', () => {
  const disposers: Array<() => void> = []

  afterEach(() => {
    while (disposers.length > 0) {
      const dispose = disposers.pop()
      dispose?.()
    }
    vi.restoreAllMocks()
  })

  it('delivers preview session updates to subscribers', () => {
    const listener = vi.fn()
    disposers.push(subscribePreviewSession(listener))

    emitPreviewSession({ sessionId: 'preview-1', status: 'ready' })

    expect(listener).toHaveBeenCalledWith({ sessionId: 'preview-1', status: 'ready' })
  })

  it('stops delivering updates after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePreviewSession(listener)

    unsubscribe()
    emitPreviewSession({ sessionId: 'preview-2' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('continues notifying later subscribers when one throws', () => {
    const error = new Error('listener failed')
    const failingListener = vi.fn(() => {
      throw error
    })
    const succeedingListener = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    disposers.push(subscribePreviewSession(failingListener))
    disposers.push(subscribePreviewSession(succeedingListener))

    emitPreviewSession({ sessionId: 'preview-3', status: 'running' })

    expect(failingListener).toHaveBeenCalledTimes(1)
    expect(succeedingListener).toHaveBeenCalledWith({ sessionId: 'preview-3', status: 'running' })
    expect(consoleError).toHaveBeenCalledWith('Failed to deliver preview session event.', error)
  })
})
