import type { MessengerMessage } from './model'
import { needsDayDivider } from './dates'

/** WhatsApp keeps a run of consecutive messages alive for a few minutes. */
export const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000

export interface MessageGroupPosition {
  /** Opens a run: this is the bubble that carries the sender name and the avatar. */
  start: boolean
  /** Closes a run: the next message starts a new one, so spacing widens after it. */
  end: boolean
}

/**
 * Two neighbours share a bubble run when the same sender wrote them close
 * together. Date separators, unsettled rows and media each start their own run,
 * so nothing that needs its own affordance ever gets merged away.
 */
export function sameMessageGroup(
  previous: MessengerMessage | undefined,
  current: MessengerMessage,
  windowMs = MESSAGE_GROUP_WINDOW_MS,
): boolean {
  if (!previous) return false
  if (previous.own !== current.own || previous.sender !== current.sender) return false
  // A retry or an undecryptable placeholder never merges with a settled neighbour.
  if (previous.pending || previous.failed || current.pending || current.failed) return false
  if (previous.unableToDecrypt !== current.unableToDecrypt) return false
  // Every attachment keeps its own row so standalone sizing stays predictable.
  if (previous.attachment && current.attachment) return false
  // A day divider between two messages always breaks the run.
  if (needsDayDivider(previous.timestamp, current.timestamp)) return false
  const gap = Math.abs(current.timestamp - previous.timestamp)
  return Number.isFinite(gap) && gap <= windowMs
}

/** Per-message run boundaries, in the same order as `messages`. */
export function messageGroupPositions(
  messages: MessengerMessage[],
  windowMs = MESSAGE_GROUP_WINDOW_MS,
): MessageGroupPosition[] {
  return messages.map((message, index) => ({
    start: !sameMessageGroup(messages[index - 1], message, windowMs),
    end: !(messages[index + 1] && sameMessageGroup(message, messages[index + 1], windowMs)),
  }))
}
