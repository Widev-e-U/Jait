export function shouldRemovePreviousChipOnBackspace(params: {
  startContainerIsRoot: boolean
  startContainerIsText: boolean
  startOffset: number
  childIndex: number
}): boolean {
  const { startContainerIsRoot, startContainerIsText, startOffset, childIndex } = params
  if (childIndex <= 0) return false
  if (startContainerIsRoot) return true
  if (startContainerIsText) return startOffset === 0
  return startOffset === 0
}

export function getRootCaretOffsetAfterChipRemoval(childIndex: number, remainingChildCount: number): number {
  return Math.max(0, Math.min(childIndex - 1, remainingChildCount))
}
