import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyTerminalExecutionEvent,
  findLiveToolTerminal,
  getLiveToolTerminals,
  resetLiveToolTerminals,
  type LiveToolTerminalExecution,
} from './tool-terminal-live'

function execution(overrides: Partial<LiveToolTerminalExecution> = {}) {
  return {
    command: 'bun run test',
    actionId: 'a-1',
    startedAt: '2026-08-25T10:00:00.000Z',
    completedAt: null,
    outputOffset: 12,
    outputEndOffset: null,
    isBackground: false,
    watched: null,
    ...overrides,
  }
}

describe('applyTerminalExecutionEvent', () => {
  beforeEach(() => resetLiveToolTerminals())

  it('records the binding a running card needs to attach', () => {
    applyTerminalExecutionEvent('s-1', { terminalId: 'term-1', execution: execution() })

    expect(getLiveToolTerminals()).toEqual([
      { terminalId: 'term-1', sessionId: 's-1', ...execution() },
    ])
  })

  it('replaces the previous execution when a terminal is reused', () => {
    applyTerminalExecutionEvent('s-1', { terminalId: 'term-1', execution: execution() })
    applyTerminalExecutionEvent('s-1', {
      terminalId: 'term-1',
      execution: execution({ command: 'git status', actionId: 'a-2', outputOffset: 40 }),
    })

    expect(getLiveToolTerminals()).toHaveLength(1)
    expect(getLiveToolTerminals()[0]).toMatchObject({ command: 'git status', outputOffset: 40 })
  })

  it('drops the binding when the call releases the terminal', () => {
    applyTerminalExecutionEvent('s-1', { terminalId: 'term-1', execution: execution() })
    applyTerminalExecutionEvent('s-1', { terminalId: 'term-1', execution: null })

    expect(getLiveToolTerminals()).toEqual([])
  })

  it('keeps a completed binding briefly, then expires it', () => {
    const completed = execution({ completedAt: '2026-08-25T10:00:05.000Z', outputEndOffset: 90 })
    applyTerminalExecutionEvent('s-1', { terminalId: 'term-1', execution: completed })
    // An unrelated terminal's event is what prunes; the completed slice must
    // survive it so a card that just attached does not go blank.
    applyTerminalExecutionEvent('s-1', {
      terminalId: 'term-2',
      execution: execution({ actionId: 'a-2' }),
    }, Date.parse('2026-08-25T10:00:10.000Z'))
    expect(getLiveToolTerminals()).toHaveLength(2)

    applyTerminalExecutionEvent('s-1', {
      terminalId: 'term-2',
      execution: execution({ actionId: 'a-3' }),
    }, Date.parse('2026-08-25T10:05:00.000Z'))
    expect(getLiveToolTerminals().map((entry) => entry.terminalId)).toEqual(['term-2'])
  })

  it('ignores a payload without a terminal', () => {
    applyTerminalExecutionEvent('s-1', undefined)
    expect(getLiveToolTerminals()).toEqual([])
  })
})

describe('findLiveToolTerminal', () => {
  const entries: LiveToolTerminalExecution[] = [
    { terminalId: 'term-1', sessionId: 's-1', ...execution({ command: 'bun run test' }) },
    {
      terminalId: 'term-2',
      sessionId: 's-1',
      ...execution({ command: 'git status', startedAt: '2026-08-25T10:00:03.000Z' }),
    },
    { terminalId: 'term-3', sessionId: 's-2', ...execution({ command: 'ls' }) },
  ]

  it('prefers this session’s execution of the same command', () => {
    expect(findLiveToolTerminal(entries, { sessionId: 's-1', command: 'bun run test' }))
      .toMatchObject({ terminalId: 'term-1' })
  })

  it('falls back to the session’s most recent execution', () => {
    expect(findLiveToolTerminal(entries, { sessionId: 's-1', command: 'unknown command' }))
      .toMatchObject({ terminalId: 'term-2' })
  })

  it('never falls back when the call already knows its terminal', () => {
    // Otherwise a finished card from an earlier turn would attach itself to
    // whatever command happens to be running right now.
    expect(findLiveToolTerminal(entries, {
      terminalId: 'term-gone',
      sessionId: 's-1',
      command: 'bun run test',
    })).toBeNull()
  })

  it('ignores other sessions', () => {
    expect(findLiveToolTerminal(entries, { sessionId: 's-3', command: 'ls' })).toBeNull()
  })
})
