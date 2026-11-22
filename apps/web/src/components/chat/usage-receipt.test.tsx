import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { UsageReceipt } from './usage-receipt'

describe('UsageReceipt', () => {
  it('shows unknown values instead of inventing zeros or an invoice', () => {
    const html = renderToStaticMarkup(<UsageReceipt usage={{ durationMs: 1 }} />)
    expect(html).toContain('input unavailable')
    expect(html).toContain('cache writes unavailable')
    expect(html).toContain('output unavailable')
    expect(html).not.toContain('configured rates')
  })
  it('shows separate cache counters and a configured-rate estimate', () => {
    const html = renderToStaticMarkup(<UsageReceipt usage={{ durationMs: 1, promptTokens: 100, cachedPromptTokens: 60, cacheWriteTokens: 20, completionTokens: 5, cost: { amount: 0.01, currency: 'USD', basis: 'configured-rates' } }} />)
    expect(html).toContain('60 cache reads')
    expect(html).toContain('20 cache writes')
    expect(html).toContain('20 other input')
    expect(html).toContain('0.01 USD estimated from configured rates')
  })
})
