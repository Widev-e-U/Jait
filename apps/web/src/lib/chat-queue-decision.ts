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
  /**
   * True when a gateway WebSocket is connected and the server-side drain
   * (`drainQueuedChatMessages`) is the authoritative queue consumer. The
   * client must NOT also auto-send in that case — the two consumers race,
   * and the losing client re-queues with a fresh server id, which makes every
   * queued message multiply. The client only takes over when the user has
   * explicitly approved sending after an interrupted exit, or when there is
   * no server connection to drain.
   */
  deferToServerDrain?: boolean
}): boolean {
  if (params.isLoading || params.isLoadingHistory || params.isProcessing) return false
  if (params.queuedCount === 0) return false
  // After an interrupted exit the user must explicitly choose to send the
  // queued message — that explicit approval is the one case where the client
  // should send even though the server drain is authoritative.
  const userApprovedAfterInterruptedExit =
    params.hasInterruptedExit && params.allowQueuedMessageAfterInterruptedExit
  if (params.deferToServerDrain && !userApprovedAfterInterruptedExit) return false
  return !shouldPromptBeforeProcessingQueuedMessage(params)
}
