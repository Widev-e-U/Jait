import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deliveryAdvances, messengerDeliveryState } from '@jait/shared'
import { DeliveryIndicator } from './delivery-indicator'

describe('DeliveryIndicator', () => {
  it('renders clock, one check, two grey checks, two blue checks', () => {
    expect(renderToStaticMarkup(<DeliveryIndicator state="sending" />)).toContain('lucide-clock')
    const sent = renderToStaticMarkup(<DeliveryIndicator state="sent" />)
    expect(sent).toContain('lucide-check')
    expect(sent).not.toContain('lucide-check-check')
    const received = renderToStaticMarkup(<DeliveryIndicator state="received" />)
    expect(received).toContain('lucide-check-check')
    expect(received).toContain('text-gray-400')
    const read = renderToStaticMarkup(<DeliveryIndicator state="read" />)
    expect(read).toContain('lucide-check-check')
    expect(read).toContain('text-blue-500')
  })
})

describe('delivery state derivation', () => {
  it('maps messenger messages onto the shared steps', () => {
    const base = { pending: false, failed: false, readBy: [] }
    expect(messengerDeliveryState({ ...base, pending: true })).toBe('sending')
    expect(messengerDeliveryState(base)).toBe('sent')
    expect(messengerDeliveryState({ ...base, bridgeStatus: 'delivered' })).toBe('received')
    expect(messengerDeliveryState({ ...base, bridgeStatus: 'delivered', readBy: [{ userId: '@a:b', name: 'A', timestamp: null, exact: true }] })).toBe('read')
    expect(messengerDeliveryState({ ...base, bridgeStatus: 'failed' })).toBe('failed')
  })

  it('only advances forwards', () => {
    expect(deliveryAdvances('sent', 'received')).toBe(true)
    expect(deliveryAdvances('read', 'received')).toBe(false)
    expect(deliveryAdvances('sending', 'failed')).toBe(false)
  })
})
