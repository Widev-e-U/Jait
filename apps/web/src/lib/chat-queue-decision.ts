export function shouldPromptBeforeProcessingQueuedMessage(params: {
  hasInterruptedExit: boolean
  isLoading: boolean
  isLoadingHistory: boolean
  queuedCount: number
  allowQueuedMessageAfterInterruptedExit: boolean
}): boolean {
  return (
    params.hasInterruptedExit &&
    !params.isLoading &&
    !params.isLoadingHistory &&
    params.queuedCount > 0 &&
    !params.allowQueuedMessageAfterInterruptedExit
  )
}

export function shouldProcessQueuedMessage(params: {
  hasInterruptedExit: boolean
  isLoading: boolean
  isLoadingHistory: boolean
  queuedCount: number
  allowQueuedMessageAfterInterruptedExit: boolean
  isProcessing: boolean
  /** True when the next queued message is held (locked) by the user. A held
   *  message blocks the queue until the user explicitly unlocks it. */
  nextItemHeld?: boolean
}): boolean {
  if (params.isLoading || params.isLoadingHistory || params.isProcessing) return false
  if (params.queuedCount === 0) return false
  if (params.nextItemHeld) return false
  // The gateway owns automatic delivery even without a WebSocket: a missing
  // UI connection does not stop the server from draining persisted messages.
  // Only an explicit choice after an interrupted exit starts a client send.
  return params.hasInterruptedExit && params.allowQueuedMessageAfterInterruptedExit
}
