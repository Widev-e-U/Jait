import type { MatrixEvent, Room } from 'matrix-js-sdk'
import type { MessengerReadReceipt } from './model'

/** Use real public watermarks only. SDK-synthesized receipts are not read evidence. */
export function roomReadReceipts(room: Room, self: string): Map<string, MessengerReadReceipt[]> {
  const timeline = room.getLiveTimeline().getEvents()
  const positions = new Map(timeline.map((event, index) => [event.getId(), index]))
  const bots = new Set<string>()
  for (const type of ['m.bridge', 'uk.half-shot.bridge']) {
    for (const event of room.currentState.getStateEvents(type)) {
      const bot = event.getContent().bridgebot
      if (typeof bot === 'string') bots.add(bot)
    }
  }
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
