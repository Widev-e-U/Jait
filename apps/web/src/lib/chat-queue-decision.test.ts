import { describe, expect, it } from 'vitest'

import { shouldProcessQueuedMessage, shouldPromptBeforeProcessingQueuedMessage } from '@/lib/chat-queue-decision'

describe('chat queue decision helpers', () => {
  it('prompts instead of auto-sending queued messages after an interrupted exit', () => {
    const params = {
      hasInterruptedExit: true,
      isLoading: false,
      isLoadingHistory: false,
      queuedCount: 1,
      allowQueuedMessageAfterInterruptedExit: false,
    }

    expect(shouldPromptBeforeProcessingQueuedMessage(params)).toBe(true)
    expect(shouldProcessQueuedMessage({ ...params, isProcessing: false })).toBe(false)
  })

  it('keeps automatic delivery at the gateway after a finished response', () => {
    const params = {
      hasInterruptedExit: false,
      isLoading: false,
      isLoadingHistory: false,
      queuedCount: 1,
      allowQueuedMessageAfterInterruptedExit: false,
    }

    expect(shouldPromptBeforeProcessingQueuedMessage(params)).toBe(false)
    expect(shouldProcessQueuedMessage({ ...params, isProcessing: false })).toBe(false)
  })

  it('sends queued messages after the user explicitly chooses that path', () => {
    const params = {
      hasInterruptedExit: true,
      isLoading: false,
      isLoadingHistory: false,
      queuedCount: 1,
      allowQueuedMessageAfterInterruptedExit: true,
    }

    expect(shouldPromptBeforeProcessingQueuedMessage(params)).toBe(false)
    expect(shouldProcessQueuedMessage({ ...params, isProcessing: false })).toBe(true)
  })

  it('does not process while loading, hydrating, processing, or empty', () => {
    const base = {
      hasInterruptedExit: false,
      isLoading: false,
      isLoadingHistory: false,
      queuedCount: 1,
      allowQueuedMessageAfterInterruptedExit: false,
      isProcessing: false,
    }

    expect(shouldProcessQueuedMessage({ ...base, isLoading: true })).toBe(false)
    expect(shouldProcessQueuedMessage({ ...base, isLoadingHistory: true })).toBe(false)
    expect(shouldProcessQueuedMessage({ ...base, isProcessing: true })).toBe(false)
    expect(shouldProcessQueuedMessage({ ...base, queuedCount: 0 })).toBe(false)
  })

  it('does not take ownership when the UI connection drops', () => {
    const base = {
      hasInterruptedExit: false,
      isLoading: false,
      isLoadingHistory: false,
      queuedCount: 1,
      allowQueuedMessageAfterInterruptedExit: false,
      isProcessing: false,
    }

    // Transport liveness cannot transfer queue ownership to the browser.
    expect(shouldProcessQueuedMessage(base)).toBe(false)
  })

  it('still sends after an explicit user approval even while connected', () => {
    const params = {
      hasInterruptedExit: true,
      isLoading: false,
      isLoadingHistory: false,
      queuedCount: 1,
      allowQueuedMessageAfterInterruptedExit: true,
      isProcessing: false,
    }

    expect(shouldProcessQueuedMessage(params)).toBe(true)
  })

  it('does not process a held (locked) next message until it is unlocked', () => {
    const base = {
      hasInterruptedExit: false,
      isLoading: false,
      isLoadingHistory: false,
      queuedCount: 1,
      allowQueuedMessageAfterInterruptedExit: false,
      isProcessing: false,
    }

    // A held next message blocks the queue even in the offline fallback path.
    expect(shouldProcessQueuedMessage({ ...base, nextItemHeld: true })).toBe(false)
    // Unlocking still leaves automatic delivery to the gateway.
    expect(shouldProcessQueuedMessage({ ...base, nextItemHeld: false })).toBe(false)
  })
})
