import { afterEach, describe, expect, it, vi } from 'vitest'
import { getNextRunTime } from './cron-utils'

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
})
