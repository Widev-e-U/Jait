import { describe, expect, it } from 'vitest'
import { teamMessageDeliveryState } from './team-chat'

const d = (status: Parameters<typeof teamMessageDeliveryState>[0][number]['status']) => ({ status })

describe('teamMessageDeliveryState', () => {
  it('is sent until an agent picks the message up', () => {
    expect(teamMessageDeliveryState([])).toBe('sent')
    expect(teamMessageDeliveryState([d('queued')])).toBe('sent')
  })
  it('is received while an agent is working or has accepted it', () => {
    expect(teamMessageDeliveryState([d('running')])).toBe('received')
    expect(teamMessageDeliveryState([d('delivered')])).toBe('received')
  })
  it('is read only once every recipient completed', () => {
    expect(teamMessageDeliveryState([d('completed'), d('completed')])).toBe('read')
    expect(teamMessageDeliveryState([d('completed'), d('running')])).toBe('received')
  })
  it('fails when any recipient failed', () => {
    for (const status of ['failed', 'blocked', 'interrupted', 'cancelled'] as const) {
      expect(teamMessageDeliveryState([d('completed'), d(status)])).toBe('failed')
    }
  })
})
