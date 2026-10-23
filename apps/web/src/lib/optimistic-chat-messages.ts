import { userMessageTextFromSegments, type UserMessageSegment } from '@/lib/user-message-segments'

export function createOptimisticMessageId(prefix: 'user' | 'assistant'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

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

/** The gateway appends ` [attached: name]` to the persisted content of a prompt with uploads. */
const ATTACHED_SUFFIX = /(?:\s*\[attached: [^\]]*\])+\s*$/

/**
 * What the user actually sees in the bubble. The optimistic copy and the
 * persisted row describe the same prompt in different shapes: the gateway
 * rewrites `content` (attachment markers, inlined file references) and
 * re-serializes the segments, so comparing raw content or segment JSON never
 * matched those prompts — the persisted row rendered in place *and* the
 * optimistic one stayed appended at the bottom, forever.
 */
function getUserRenderSignature(message: OptimisticUserMessageLike): string | null {
  if (message.role !== 'user') return null
  const segmentText = Array.isArray(message.displaySegments) && message.displaySegments.length > 0
    ? userMessageTextFromSegments(message.displaySegments)
    : ''
  const displayContent = typeof message.displayContent === 'string' ? message.displayContent : ''
  const content = typeof message.content === 'string' ? message.content : ''
  const visible = (segmentText || displayContent || content).replace(ATTACHED_SUFFIX, '')
  return visible.replace(/\s+/g, ' ').trim()
}

export function mergeSnapshotMessagesWithOptimisticUsers<T extends OptimisticUserMessageLike>(
  snapshotMessages: T[],
  currentMessages: T[],
): T[] {
  const snapshotUserCounts = new Map<string, number>()
  // A persisted prompt this client already renders under its own id is not the
  // server copy of a pending send. Counting it let an older identical prompt
  // ("go on", "continue") swallow the new optimistic one, which then vanished
  // until the next reload.
  const renderedPersistedIds = new Set(
    currentMessages.filter(message => !message.optimistic).map(message => message.id),
  )

  for (const message of snapshotMessages) {
    if (renderedPersistedIds.has(message.id)) continue
    const signature = getUserRenderSignature(message)
    if (signature === null) continue
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

    const signature = getUserRenderSignature(message) ?? ''
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
    if (signature === null) continue
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
    let matched = existing ?? (signature !== null ? pendingUsers.get(signature)?.shift() : undefined)
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
