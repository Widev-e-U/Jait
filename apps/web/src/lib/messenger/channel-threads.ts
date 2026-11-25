import type { MessengerMessage } from './model'

/** Teams bridges can represent a channel reply using either Matrix relation. */
export function channelThreads(messages: MessengerMessage[], includePlainReplies: boolean) {
  const byId = new Map(messages.map(message => [message.id, message]))
  const replies = new Map<string, MessengerMessage[]>()
  const roots = messages.filter(message => {
    const visited = new Set([message.id])
    let root = message
    for (;;) {
      const parentId = root.threadRootId ?? (includePlainReplies ? root.replyTo?.id : undefined)
      if (!parentId) break
      const parent = byId.get(parentId)
      if (!parent || visited.has(parentId)) return true
      visited.add(parentId)
      root = parent
    }
    if (root === message) return true
    const rootId = root.id
    const thread = replies.get(rootId) ?? []
    thread.push(message)
    replies.set(rootId, thread)
    return false
  })
  return { roots, replies }
}
