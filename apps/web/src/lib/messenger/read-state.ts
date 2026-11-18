import type { MatrixEvent, Room } from 'matrix-js-sdk'
import type { MessengerMessage, MessengerReadReceipt } from './model'

function bridgeBots(room: Room): Set<string> {
  const bots = new Set<string>()
  for (const type of ['m.bridge', 'uk.half-shot.bridge']) {
    for (const event of room.currentState.getStateEvents(type)) {
      const bot = event.getContent().bridgebot
      if (typeof bot === 'string') bots.add(bot)
    }
  }
  return bots
}

/** Use real public watermarks only. SDK-synthesized receipts are not read evidence. */
export function roomReadReceipts(room: Room, self: string): Map<string, MessengerReadReceipt[]> {
  const timeline = room.getLiveTimeline().getEvents()
  const positions = new Map(timeline.map((event, index) => [event.getId(), index]))
  const bots = bridgeBots(room)
  const result = new Map<string, MessengerReadReceipt[]>()
  for (const member of room.getMembers()) {
    if (member.userId === self || bots.has(member.userId)) continue
    const receipt = room.getReadReceiptForUserId(member.userId, true)
    if (!receipt || (receipt.data.thread_id && receipt.data.thread_id !== 'main')) continue
    const end = positions.get(receipt.eventId)
    if (end === undefined) continue // Unknown ordering is not proof of a read.
    const timestamp = receipt.data.ts
    for (let index = 0; index <= end; index++) {
      const event = timeline[index]!
      if (event.getSender() !== self || event.status || !event.getId()) continue
      const id = event.getId()!
      const readers = result.get(id) ?? []
      readers.push({
        userId: member.userId, name: member.name || member.userId,
        timestamp: Number.isFinite(timestamp) && timestamp > 0 && timestamp <= 8.64e15 ? timestamp : null,
        exact: receipt.eventId === id,
      })
      result.set(id, readers)
    }
  }
  return result
}

export function latestConfirmedEvent(room: Room): MatrixEvent | undefined {
  return room.getLiveTimeline().getEvents().filter(event => !event.status && event.getId()).at(-1)
}

/** Bridge acknowledgement and delivery evidence for the direct Matrix client. */
export function roomBridgeStatuses(room: Room, self: string): Map<string, NonNullable<MessengerMessage['bridgeStatus']>> {
  const timeline = room.getLiveTimeline().getEvents()
  const own = new Set(timeline.filter(event => event.getSender() === self && !event.status).map(event => event.getId()).filter((id): id is string => !!id))
  const bots = bridgeBots(room)
  const result = new Map<string, NonNullable<MessengerMessage['bridgeStatus']>>()
  for (const bot of bots) {
    const receipt = room.getReadReceiptForUserId(bot, true)
    if (receipt && (!receipt.data.thread_id || receipt.data.thread_id === 'main') && own.has(receipt.eventId)) result.set(receipt.eventId, 'sent')
  }
  for (const event of timeline) {
    if (event.getType() !== 'com.beeper.message_send_status' || !bots.has(event.getSender() ?? '')) continue
    const content = event.getContent()
    const relation = content['m.relates_to']
    const target = relation?.event_id
    if (relation?.rel_type !== 'm.reference' || typeof target !== 'string' || !own.has(target)) continue
    if (content.status === 'SUCCESS') {
      const recipients = content.delivered_to_users
      const delivered = Array.isArray(recipients) && recipients.some((id: unknown) => typeof id === 'string' && /^@[^:\s]+:[^\s]+$/.test(id) && id !== self && !bots.has(id))
      if (delivered || result.get(target) !== 'delivered') result.set(target, delivered ? 'delivered' : 'sent')
    } else if ((content.status === 'PENDING' || content.status === 'FAIL_RETRIABLE') && result.get(target) !== 'delivered') result.set(target, 'pending')
    else if (content.status === 'FAIL_PERMANENT') result.set(target, 'failed')
  }
  return result
}
