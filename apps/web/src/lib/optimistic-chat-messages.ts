import type { UserMessageSegment } from '@/lib/user-message-segments'

export interface OptimisticUserMessageLike {
  id: string
  role: 'user' | 'assistant'
  content: string
  displayContent?: string
  displaySegments?: UserMessageSegment[]
  optimistic?: boolean
}

export function createOptimisticAssistantPlaceholder(id: string): OptimisticUserMessageLike {
  return { id, role: 'assistant', content: '', optimistic: true }
}

function getUserRenderSignature(message: OptimisticUserMessageLike): string | null {
  if (message.role !== 'user') return null
  const hasDisplaySegments = Array.isArray(message.displaySegments) && message.displaySegments.length > 0
  const normalizedContent = (typeof message.content === 'string' ? message.content : '').trim()
  const displayContent = typeof message.displayContent === 'string'
    ? message.displayContent.trim()
    : ''
  const normalizedDisplay = displayContent === normalizedContent ? '' : displayContent
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

  const unmatchedOptimisticMessages: T[] = []
  let preserveNextOptimisticAssistant = false
  for (const message of currentMessages) {
    if (!message.optimistic) {
      preserveNextOptimisticAssistant = false
      continue
    }
    if (message.role === 'assistant') {
      if (preserveNextOptimisticAssistant) {
        unmatchedOptimisticMessages.push(message)
      }
      preserveNextOptimisticAssistant = false
      continue
    }
    if (message.role !== 'user') {
      preserveNextOptimisticAssistant = false
      continue
    }

    const signature = getUserRenderSignature(message)
    if (!signature) {
      unmatchedOptimisticMessages.push(message)
      preserveNextOptimisticAssistant = true
      continue
    }
    const matchedCount = snapshotUserCounts.get(signature) ?? 0
    if (matchedCount > 0) {
      snapshotUserCounts.set(signature, matchedCount - 1)
      preserveNextOptimisticAssistant = false
      continue
    }
    unmatchedOptimisticMessages.push(message)
    preserveNextOptimisticAssistant = true
  }

  if (unmatchedOptimisticMessages.length === 0) return snapshotMessages
  return [...snapshotMessages, ...unmatchedOptimisticMessages]
}
