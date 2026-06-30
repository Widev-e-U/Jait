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
}): boolean {
  if (params.isLoading || params.isLoadingHistory || params.isProcessing) return false
  if (params.queuedCount === 0) return false
  return !shouldPromptBeforeProcessingQueuedMessage(params)
}
