import { describe, expect, it } from 'vitest'
import { dayDividerLabel, dayKey, needsDayDivider } from './dates'

const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0).getTime()

describe('day dividers', () => {
  it('keys days by local calendar date rather than by elapsed hours', () => {
    expect(dayKey(at(2025, 3, 9, 0, 1))).toBe(dayKey(at(2025, 3, 9, 23, 59)))
    expect(dayKey(at(2025, 3, 9, 23, 59))).not.toBe(dayKey(at(2025, 3, 10, 0, 1)))
    expect(dayKey(at(2025, 12, 31, 23, 59))).not.toBe(dayKey(at(2026, 1, 1, 0, 1)))
  })

  it('opens a divider for the first message and whenever the calendar day changes', () => {
    expect(needsDayDivider(null, at(2025, 5, 1))).toBe(true)
    expect(needsDayDivider(undefined, at(2025, 5, 1))).toBe(true)
    expect(needsDayDivider(at(2025, 5, 1, 9), at(2025, 5, 1, 18))).toBe(false)
    expect(needsDayDivider(at(2025, 5, 1, 23, 59), at(2025, 5, 2, 0, 1))).toBe(true)
  })

  it('labels today and yesterday relatively and capitalizes them', () => {
    const now = at(2025, 5, 20, 15)
    for (const [timestamp, pattern] of [
      [at(2025, 5, 20, 8), /^(today|heute)$/i],
      [at(2025, 5, 19, 22), /^(yesterday|gestern)$/i],
    ] as const) {
      const label = dayDividerLabel(timestamp, now)
      expect(label).toMatch(pattern)
      expect(label[0]).toBe(label[0].toLocaleUpperCase())
    }
  })

  it('uses a short absolute date for older days and keeps the year when it differs', () => {
    const now = at(2025, 5, 20, 15)
    const recent = dayDividerLabel(at(2025, 5, 4, 10), now)
    expect(recent).not.toMatch(/today|heute|yesterday|gestern/i)
    expect(recent).toMatch(/4/)
    expect(recent).not.toMatch(/2025/)

    const older = dayDividerLabel(at(2024, 11, 3, 10), now)
    expect(older).toMatch(/2024/)
    expect(older).not.toMatch(/today|heute|yesterday|gestern/i)
  })
})
