import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MessageReadStatus } from './message-read-status'

describe('Messenger delivery indicators', () => {
  it('shows one gray check when sent or delivery is unknown', () => {
    for (const bridgeStatus of [undefined, 'sent'] as const) {
      const html = renderToStaticMarkup(<MessageReadStatus inline readers={[]} bridgeStatus={bridgeStatus} />)
      expect(html).toContain('text-gray-400')
      expect(html).toContain('lucide-check ')
      expect(html).not.toContain('lucide-check-check')
    }
  })

  it('shows two gray checks for delivery', () => {
    const html = renderToStaticMarkup(<MessageReadStatus inline readers={[]} bridgeStatus="delivered" />)
    expect(html).toContain('aria-label="Delivered"')
    expect(html).toContain('text-gray-400')
    expect(html).toContain('lucide-check-check')
  })

  it('shows two blue checks when a recipient has read the message', () => {
    const html = renderToStaticMarkup(<MessageReadStatus inline readers={[{ userId: '@reader:example.com', name: 'Reader', timestamp: null, exact: true }]} bridgeStatus="delivered" />)
    expect(html).toContain('aria-label="Read; show receipts"')
    expect(html).toContain('text-blue-500')
    expect(html).toContain('lucide-check-check')
  })
})
