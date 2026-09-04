import { describe, expect, it } from 'vitest'
import { formatAgo } from './relative-time'

const NOW = new Date('2026-04-25T12:00:00.000Z')

describe('formatAgo', () => {
  it('says "just now" under a minute', () => {
    expect(formatAgo('2026-04-25T11:59:30.000Z', NOW)).toBe('just now')
  })

  it('uses minutes under an hour', () => {
    expect(formatAgo('2026-04-25T11:30:00.000Z', NOW)).toBe('30m ago')
  })

  it('uses hours under a day', () => {
    expect(formatAgo('2026-04-25T09:00:00.000Z', NOW)).toBe('3h ago')
  })

  it('falls back to the locale date beyond a day', () => {
    const label = formatAgo('2026-04-01T00:00:00.000Z', NOW)
    expect(label).toBe(new Date('2026-04-01T00:00:00.000Z').toLocaleDateString())
  })
})