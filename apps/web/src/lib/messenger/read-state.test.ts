import { describe, expect, it, vi } from 'vitest'
import type { Room } from 'matrix-js-sdk'
import { roomReadReceipts } from './read-state'

function fixture() {
  const events = ['$a', '$b', '$c'].map(id => ({ getId: () => id, getSender: () => '@me:server', status: null }))
  const receipt = vi.fn(() => ({ eventId: '$b', data: { ts: 1_700_000_000_000 } }))
  const room = {
    getLiveTimeline: () => ({ getEvents: () => events }),
    currentState: { getStateEvents: () => [] },
    getMembers: () => [{ userId: '@me:server', name: 'Me' }, { userId: '@bob:server', name: 'Bob' }],
    getReadReceiptForUserId: receipt,
  }
  return { room, receipt, events, read: () => roomReadReceipts(room as unknown as Room, '@me:server') }
}

describe('public Matrix read evidence', () => {
  it('carries a real receipt backwards through known history but never forwards', () => {
    const { read, receipt } = fixture()
    const result = read()
    expect(receipt).toHaveBeenCalledWith('@bob:server', true)
    expect(result.get('$a')).toEqual([{ userId: '@bob:server', name: 'Bob', timestamp: 1_700_000_000_000, exact: false }])
    expect(result.get('$b')?.[0]?.exact).toBe(true)
    expect(result.has('$c')).toBe(false)
  })
  it('does not invent seen state for unknown ordering or missing public receipts', () => {
    const { read, receipt } = fixture()
    receipt.mockReturnValue({ eventId: '$not-loaded', data: { ts: 10 } })
    expect(read().size).toBe(0)
    receipt.mockReturnValue(null as never)
    expect(read().size).toBe(0)
  })
  it('does not reuse a threaded receipt as a room-wide watermark', () => {
    const { read, receipt } = fixture()
    receipt.mockReturnValue({ eventId: '$b', data: { ts: 10, thread_id: '$thread' } } as never)
    expect(read().size).toBe(0)
  })
  it('excludes bridge bots, self, and unsent events', () => {
    const { read, room, events } = fixture()
    events[0]!.status = 'sending' as never
    expect(read().has('$a')).toBe(false)
    room.currentState.getStateEvents = () => [{ getContent: () => ({ bridgebot: '@bob:server' }) }] as never
    expect(read().size).toBe(0)
  })
  it.each([NaN, Infinity, -1, 9e16, undefined])('retains a read with an unknown time instead of fabricating a date (%s)', ts => {
    const { read, receipt } = fixture()
    receipt.mockReturnValue({ eventId: '$b', data: { ts } } as never)
    expect(read().get('$b')?.[0]?.timestamp).toBeNull()
  })
})

describe('bridge status evidence', () => {
  it('trusts only the bridge bot and preserves delivery', async () => {
    const { roomBridgeStatuses } = await import('./read-state')
    const message = { getId: () => '$a', getSender: () => '@me:server', getType: () => 'm.room.message', status: null }
    const status = (sender: string, state: string, delivered?: string[]) => ({
      getId: () => '$status', getSender: () => sender, getType: () => 'com.beeper.message_send_status', status: null,
      getContent: () => ({ 'm.relates_to': { rel_type: 'm.reference', event_id: '$a' }, status: state, delivered_to_users: delivered }),
    })
    const events = [message, status('@intruder:server', 'SUCCESS', ['@bob:server'])]
    const room = { getLiveTimeline: () => ({ getEvents: () => events }), currentState: { getStateEvents: () => [{ getContent: () => ({ bridgebot: '@bot:server' }) }] }, getReadReceiptForUserId: () => null } as unknown as Room
    expect(roomBridgeStatuses(room, '@me:server').size).toBe(0)
    events.push(status('@bot:server', 'SUCCESS'))
    expect(roomBridgeStatuses(room, '@me:server').get('$a')).toBe('sent')
    events.push(status('@bot:server', 'SUCCESS', ['@bob:server']))
    expect(roomBridgeStatuses(room, '@me:server').get('$a')).toBe('delivered')
    events.push(status('@bot:server', 'SUCCESS'), status('@bot:server', 'PENDING'))
    expect(roomBridgeStatuses(room, '@me:server').get('$a')).toBe('delivered')
  })
})
