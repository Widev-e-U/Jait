import type { UserMessageSegment } from '@/lib/user-message-segments'

export interface OptimisticUserMessageLike {
  id: string
  role: 'user' | 'assistant'
  content: string
  displayContent?: string
  displaySegments?: UserMessageSegment[]
  optimistic?: boolean
}

function getUserRenderSignature(message: OptimisticUserMessageLike): string | null {
  if (message.role !== 'user') return null
  const hasDisplaySegments = Array.isArray(message.displaySegments) && message.displaySegments.length > 0
  const normalizedContent = message.content.trim()
  const normalizedDisplay = typeof message.displayContent === 'string'
    ? message.displayContent.trim()
    : ''
  return JSON.stringify({
    role: 'user',
    content: normalizedContent,
    displayContent: normalizedDisplay,
    displaySegments: hasDisplaySegments ? message.displaySegments : null,
  })
}

export function mergeSnapshotMessagesWithOptimisticUsers<T extends OptimisticUserMessageLike>(
  snapshotMessages: T[],
  currentMessages: T[],
): T[] {
  const snapshotUserCounts = new Map<string, number>()

  for (const message of snapshotMessages) {
    const signature = getUserRenderSignature(message)
    if (!signature) continue
    snapshotUserCounts.set(signature, (snapshotUserCounts.get(signature) ?? 0) + 1)
  }

  const unmatchedOptimisticUsers: T[] = []
  for (const message of currentMessages) {
    if (!message.optimistic || message.role !== 'user') continue
    const signature = getUserRenderSignature(message)
    if (!signature) {
      unmatchedOptimisticUsers.push(message)
      continue
    }
    const matchedCount = snapshotUserCounts.get(signature) ?? 0
    if (matchedCount > 0) {
      snapshotUserCounts.set(signature, matchedCount - 1)
      continue
    }
    unmatchedOptimisticUsers.push(message)
  }

  if (unmatchedOptimisticUsers.length === 0) return snapshotMessages
  return [...snapshotMessages, ...unmatchedOptimisticUsers]
}
