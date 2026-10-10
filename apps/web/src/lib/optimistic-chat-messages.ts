import type { UserMessageSegment } from '@/lib/user-message-segments'

export interface OptimisticUserMessageLike {
  id: string
  /** Stable UI identity across optimistic-to-persisted reconciliation. */
  renderId?: string
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

  const currentById = new Map(currentMessages.map(message => [message.id, message]))
  const snapshotIds = new Set(snapshotMessages.map(message => message.id))
  const pendingUsers = new Map<string, T[]>()
  for (const message of currentMessages) {
    if (!message.optimistic || snapshotIds.has(message.id)) continue
    const signature = getUserRenderSignature(message)
    if (!signature) continue
    const pending = pendingUsers.get(signature) ?? []
    pending.push(message)
    pendingUsers.set(signature, pending)
  }
  // The durable ID is needed by edit/delete APIs. Keep a separate UI identity:
  // replacing a local prompt's ID after done must not look like a new turn to
  // the conversation's top-alignment effect or reset its virtual row.
  const currentIndices = new Map(currentMessages.map((message, index) => [message.id, index]))
  let matchedPromptIndex: number | undefined
  const reconciled = snapshotMessages.map(message => {
    const existing = currentById.get(message.id)
    const signature = getUserRenderSignature(message)
    let matched = existing ?? (signature ? pendingUsers.get(signature)?.shift() : undefined)
    // The response belongs to this same reconciled turn. Its temporary row
    // must keep its measurements and detached reading anchor as well.
    if (!matched && message.role === 'assistant' && matchedPromptIndex != null) {
      const response = currentMessages[matchedPromptIndex + 1]
      if (response?.role === 'assistant' && !snapshotIds.has(response.id)) matched = response
    }
    matchedPromptIndex = message.role === 'user' && matched ? currentIndices.get(matched.id) : undefined
    const renderId = matched?.renderId ?? (matched && (matched.optimistic || matched.id !== message.id) ? matched.id : undefined)
    return renderId && renderId !== message.renderId ? { ...message, renderId } : message
  })
  return unmatchedOptimisticMessages.length === 0
    ? reconciled
    : [...reconciled, ...unmatchedOptimisticMessages]
}
