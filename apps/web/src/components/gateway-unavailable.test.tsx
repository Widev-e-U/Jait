import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GatewayUnavailable, normalizeGatewayUrlInput } from './gateway-unavailable'

describe('GatewayUnavailable', () => {
  it('offers standalone clients an offline backend editor', () => {
    const markup = renderToStaticMarkup(
      <GatewayUnavailable onRetry={() => {}} canSetBackend />,
    )

    expect(markup).toContain('Set backend')
    expect(markup).toContain('Retry Connection')
  })

  it('does not offer backend overrides in the hosted web app', () => {
    const markup = renderToStaticMarkup(
      <GatewayUnavailable onRetry={() => {}} />,
    )

    expect(markup).not.toContain('Set backend')
  })

  it('normalizes HTTP gateway URLs without contacting them', () => {
    expect(normalizeGatewayUrlInput('  http://192.168.1.20:8000/  ')).toBe(
      'http://192.168.1.20:8000',
    )
    expect(() => normalizeGatewayUrlInput('ftp://192.168.1.20')).toThrow(
      'must start with http:// or https://',
    )
    expect(() => normalizeGatewayUrlInput('not a URL')).toThrow('Enter a valid URL')
  })
})
