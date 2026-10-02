import { describe, expect, it } from 'vitest'
import { earliestAgentStart, formatAgentElapsed } from './agent-runtime'

describe('agent elapsed time', () => {
  it('calculates from persisted time across reloads and rolls over hours', () => {
    const start = '2026-10-02T12:00:00.000Z'
    expect(formatAgentElapsed(start, Date.parse('2026-10-02T12:12:34Z'))).toBe('12:34')
    expect(formatAgentElapsed(start, Date.parse('2026-10-02T13:02:03Z'))).toBe('1:02:03')
    expect(formatAgentElapsed(start, Date.parse('2026-10-02T11:59:59Z'))).toBe('0:00')
    expect(formatAgentElapsed(null, Date.now())).toBe('—')
    expect(formatAgentElapsed('bad date', Date.now())).toBe('—')
  })
  it('uses the earliest active run and ignores completed runs', () => {
    expect(earliestAgentStart([
      { running: false, startedAt: '2026-10-01T12:00:00Z' },
      { running: true, startedAt: '2026-10-02T12:01:00Z' },
      { running: true, startedAt: 'bad date' },
      { running: true, startedAt: '2026-10-02T12:00:00Z' },
    ])).toBe('2026-10-02T12:00:00Z')
  })
})
