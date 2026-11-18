import { describe, expect, it } from 'vitest'
import {
  describeResetCredits,
  describeUsageReset,
  describeUsageResetSource,
  formatResetCountdown,
  parseResetAt,
  quotaLabel,
} from './usage-resets'

const NOW = new Date('2026-03-11T12:00:00.000Z')

describe('quotaLabel', () => {
  it('maps known rate limit types', () => {
    expect(quotaLabel('five_hour')).toBe('5-hour limit')
    expect(quotaLabel('seven_day_opus')).toBe('Opus weekly limit')
    expect(quotaLabel('request_activity')).toBe('Request activity')
  })

  it('falls back to a readable form of the raw type', () => {
    expect(quotaLabel('custom_window')).toBe('custom window')
    expect(quotaLabel(null)).toBe('Limit')
  })
})

describe('parseResetAt', () => {
  it('parses ISO deadlines and rejects unusable input', () => {
    expect(parseResetAt('2026-03-11T15:00:00.000Z')?.getTime()).toBe(Date.parse('2026-03-11T15:00:00.000Z'))
    expect(parseResetAt('not a date')).toBeNull()
    expect(parseResetAt(null)).toBeNull()
  })
})

describe('formatResetCountdown', () => {
  it('formats coarse buckets', () => {
    const deadline = new Date(NOW.getTime() + (3 * 60 + 5) * 60_000)
    expect(formatResetCountdown(deadline, NOW)).toBe('3h 5m')
    expect(formatResetCountdown(new Date(NOW.getTime() + 12 * 60_000), NOW)).toBe('12m')
    expect(formatResetCountdown(new Date(NOW.getTime() + (2 * 24 + 4) * 60 * 60_000), NOW)).toBe('2d 4h')
  })

  it('handles near and past deadlines', () => {
    expect(formatResetCountdown(new Date(NOW.getTime() + 30_000), NOW)).toBe('under a minute')
    expect(formatResetCountdown(NOW, NOW)).toBe('now')
  })
})

describe('describeUsageReset', () => {
  it('returns null for missing or invalid deadlines', () => {
    expect(describeUsageReset(null, 'provider-reported', NOW)).toBeNull()
    expect(describeUsageReset('nonsense', null, NOW)).toBeNull()
  })

  it('labels provider-reported deadlines as not estimated', () => {
    const reset = describeUsageReset('2026-03-11T14:15:00.000Z', 'provider-reported', NOW)
    expect(reset).not.toBeNull()
    expect(reset?.text).toBe('Resets in 2h 15m')
    expect(reset?.estimated).toBe(false)
    expect(reset?.title).toContain('Reported by the provider')
  })

  it('marks reconstructed deadlines as estimates', () => {
    expect(describeUsageReset('2026-03-11T18:00:00.000Z', 'window-grid', NOW)?.estimated).toBe(true)
    expect(describeUsageReset('2026-03-11T18:00:00.000Z', 'window-boundary', NOW)?.estimated).toBe(true)
    expect(describeUsageReset('2026-03-11T18:00:00.000Z', 'observed', NOW)?.estimated).toBe(false)
  })

  it('flags elapsed deadlines', () => {
    const reset = describeUsageReset('2026-03-11T11:00:00.000Z', 'provider-reported', NOW)
    expect(reset?.elapsed).toBe(true)
    expect(reset?.text).toContain('Reset time passed')
  })

  it('treats unknown source strings as unsourced', () => {
    const reset = describeUsageReset('2026-03-11T18:00:00.000Z', 'made-up-source', NOW)
    expect(reset?.estimated).toBe(false)
    expect(reset?.title).toContain('Reset deadline from the last reported usage window')
  })
})

describe('describeUsageResetSource', () => {
  it('explains every known source', () => {
    expect(describeUsageResetSource('provider-reported')).toBe('Reported by the provider')
    expect(describeUsageResetSource('observed')).toBe('Confirmed by an observed usage reset')
    expect(describeUsageResetSource('window-boundary')).toBe('Continued from the previous reset deadline')
    expect(describeUsageResetSource('window-grid')).toBe('Estimated from usage window boundaries')
    expect(describeUsageResetSource(null)).toBe('Reset deadline from the last reported usage window')
  })
})

describe('describeResetCredits', () => {
  it('returns null when there is nothing to spend', () => {
    expect(describeResetCredits(null)).toBeNull()
    expect(describeResetCredits(undefined)).toBeNull()
    expect(describeResetCredits({ availableCount: 0, credits: [] })).toBeNull()
    expect(describeResetCredits({})).toBeNull()
  })

  it('uses the provider count and handles the singular case', () => {
    expect(describeResetCredits({ availableCount: 1, credits: [] })?.text).toBe('1 reset available')
    const two = describeResetCredits({ availableCount: 2, credits: [] })
    expect(two?.count).toBe(2)
    expect(two?.text).toBe('2 resets available')
  })

  it('falls back to listed credits and lists titles with expiry dates', () => {
    const display = describeResetCredits({
      credits: [
        { title: 'Full reset (Weekly + 5 hr)', status: 'available', expiresAt: 1_775_001_600 },
        { title: 'Spent reset', status: 'consumed', expiresAt: 1_775_001_600 },
        { status: 'available' },
      ],
    })
    expect(display?.count).toBe(2)
    expect(display?.title).toContain('Full reset (Weekly + 5 hr) — expires')
    expect(display?.title).not.toContain('Spent reset')
    expect(display?.title).toContain('Usage limit reset')
  })
})
