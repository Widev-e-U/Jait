import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeCron, formatRelativeTime, getNextRunTime, normalizeCronExpression, validateCron } from './cron-utils'

describe('cron utils', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the next future step run when the current minute is already on the boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T10:05:30.000Z'))

    expect(getNextRunTime('*/5 * * * *')?.toISOString()).toBe('2026-04-25T10:10:00.000Z')
  })

  it('advances step schedules when the current time lands exactly on the run boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T10:05:00.000Z'))

    expect(getNextRunTime('*/5 * * * *')?.toISOString()).toBe('2026-04-25T10:10:00.000Z')
  })

  it('rolls step schedules into the next hour when needed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T10:59:45.000Z'))

    expect(getNextRunTime('*/15 * * * *')?.toISOString()).toBe('2026-04-25T11:00:00.000Z')
  })

  it('returns the next minute for every-minute schedules', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T10:05:30.000Z'))

    expect(getNextRunTime('* * * * *')?.toISOString()).toBe('2026-04-25T10:06:00.000Z')
  })

  it('returns the next top-of-hour run for hourly schedules', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T10:05:30.000Z'))

    expect(getNextRunTime('0 * * * *')?.toISOString()).toBe('2026-04-25T11:00:00.000Z')
  })

  it('returns the next stepped hour run for every-2-hours schedules', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T11:05:30.000Z'))

    expect(getNextRunTime('0 */2 * * *')?.toISOString()).toBe('2026-04-25T12:00:00.000Z')
  })

  it('normalizes repeated whitespace before storing or parsing cron expressions', () => {
    expect(normalizeCronExpression('  */5   *  * *   *  ')).toBe('*/5 * * * *')
  })

  it('describes preset cron expressions even when user input contains extra spaces', () => {
    expect(describeCron('  0   9 * * *  ')).toBe('Runs at 09:00 every day')
  })

  it('calculates next run times for step schedules with extra spaces', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T10:05:30.000Z'))

    expect(getNextRunTime('  */5   * * * * ')?.toISOString()).toBe('2026-04-25T10:10:00.000Z')
  })

  it('keeps cron validation working for normalized whitespace variants', () => {
    expect(validateCron(' 0   18 * * * ').valid).toBe(true)
  })

  it('rejects malformed numeric fields instead of partially parsing them', () => {
    expect(validateCron('5foo * * * *')).toEqual({
      valid: false,
      error: 'Invalid minute: 5foo',
    })
    expect(validateCron('*/5bar * * * *')).toEqual({
      valid: false,
      error: 'Invalid minute: */5bar',
    })
    expect(validateCron('0 9-10x * * *')).toEqual({
      valid: false,
      error: 'Invalid hour: 9-10x',
    })
    expect(validateCron('0 9,10x * * *')).toEqual({
      valid: false,
      error: 'Invalid hour: 9,10x',
    })
  })

  it('returns null for malformed schedules when computing next run times', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T10:05:30.000Z'))

    expect(getNextRunTime('*/5bar * * * *')).toBeNull()
    expect(getNextRunTime('0 9x * * *')).toBeNull()
  })

  it('does not round relative times up before the next hour boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T10:00:00.000Z'))

    expect(formatRelativeTime(new Date('2026-04-25T10:59:30.000Z'))).toBe('in 59m')
  })

  it('does not round relative times up before the next day boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T10:00:00.000Z'))

    expect(formatRelativeTime(new Date('2026-04-26T09:59:59.000Z'))).toBe('in 23h')
  })

  it('shows now for sub-minute future times', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T10:00:00.000Z'))

    expect(formatRelativeTime(new Date('2026-04-25T10:00:59.000Z'))).toBe('now')
  })
})
