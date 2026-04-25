import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeCron, getNextRunTime, normalizeCronExpression, validateCron } from './cron-utils'

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
})
