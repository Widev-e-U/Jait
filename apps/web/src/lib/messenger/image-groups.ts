import type { MessengerMessage } from './model'
import { needsDayDivider } from './dates'
import { isStandaloneImage } from './standalone'

// Bridges expose photos as separate events without an album identifier. Group
// only consecutive, uncaptioned photos and videos sent close together by the same person.
export const IMAGE_GROUP_WINDOW_MS = 60_000
export const ALBUM_PREVIEW_SIZE = 4

function isAlbumMedia(message: MessengerMessage): boolean {
  if (message.pending || message.failed || message.unableToDecrypt || message.replyTo) return false
  if (isStandaloneImage(message)) return true
  const attachment = message.attachment
  const body = message.body.trim()
  return !!attachment && attachment.mime.toLowerCase().startsWith('video/')
    && (!body || body === attachment.name.trim())
}

export function imageMessageGroups(
  messages: MessengerMessage[],
  include: (message: MessengerMessage) => boolean = () => true,
): Array<{ startIndex: number; messages: MessengerMessage[] }> {
  const groups: Array<{ startIndex: number; messages: MessengerMessage[] }> = []
  for (const [index, message] of messages.entries()) {
    const group = groups[groups.length - 1]
    const previous = group?.messages[group.messages.length - 1]
    const gap = previous ? message.timestamp - previous.timestamp : NaN
    const sameSender = previous && previous.own === message.own && previous.sender === message.sender
      && (!previous.senderId || !message.senderId || previous.senderId === message.senderId)
    if (previous && sameSender && isAlbumMedia(previous) && isAlbumMedia(message)
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
