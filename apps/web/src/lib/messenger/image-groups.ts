import type { MessengerMessage } from './model'
import { needsDayDivider } from './dates'
import { isStandaloneImage } from './standalone'

// Bridges expose photos as separate events without an album identifier. Group
// only consecutive, uncaptioned photos sent close together by the same person.
export const IMAGE_GROUP_WINDOW_MS = 60_000
export const MAX_IMAGE_GROUP_SIZE = 4

export function imageMessageGroups(
  messages: MessengerMessage[],
  include: (message: MessengerMessage) => boolean = () => true,
): Array<{ startIndex: number; messages: MessengerMessage[] }> {
  const groups: Array<{ startIndex: number; messages: MessengerMessage[] }> = []
  for (const [index, message] of messages.entries()) {
    const group = groups[groups.length - 1]
    const previous = group?.messages[group.messages.length - 1]
    const eligible = (item: MessengerMessage) => isStandaloneImage(item) && !item.pending && !item.failed && !item.unableToDecrypt && !item.replyTo
    const gap = previous ? message.timestamp - previous.timestamp : NaN
    const sameSender = previous && previous.own === message.own && previous.sender === message.sender
      && (!previous.senderId || !message.senderId || previous.senderId === message.senderId)
    if (previous && group.messages.length < MAX_IMAGE_GROUP_SIZE && sameSender && eligible(previous) && eligible(message)
      && Number.isFinite(gap) && gap >= 0 && gap <= IMAGE_GROUP_WINDOW_MS
      && !needsDayDivider(previous.timestamp, message.timestamp)) {
      group.messages.push(message)
    } else {
      groups.push({ startIndex: index, messages: [message] })
    }
  }
  // Group before filtering, so search results cannot join photos that were
  // separated by a hidden message in the original conversation.
  let visibleIndex = 0
  return groups.flatMap(group => {
    const visible = group.messages.filter(include)
    if (!visible.length) return []
    const result = { startIndex: visibleIndex, messages: visible }
    visibleIndex += visible.length
    return [result]
  })
}
