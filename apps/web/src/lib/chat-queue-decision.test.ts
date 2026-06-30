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

  it('sends queued messages normally after a finished response', () => {
    const params = {
      hasInterruptedExit: false,
      isLoading: false,
      isLoadingHistory: false,
      queuedCount: 1,
      allowQueuedMessageAfterInterruptedExit: false,
    }

    expect(shouldPromptBeforeProcessingQueuedMessage(params)).toBe(false)
    expect(shouldProcessQueuedMessage({ ...params, isProcessing: false })).toBe(true)
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
})
