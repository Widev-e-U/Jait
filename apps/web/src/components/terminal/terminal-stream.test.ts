import { describe, expect, it } from 'vitest'
import { shouldAcceptTerminalOutput } from './terminal-stream'

describe('shouldAcceptTerminalOutput', () => {
  it('accepts legacy payloads without stream metadata', () => {
    const lastSeqByStream = new Map<string, number>()

    expect(
      shouldAcceptTerminalOutput(lastSeqByStream, 'term-1', {
        type: 'terminal.output',
        terminalId: 'term-1',
        data: 'hello',
      }),
    ).toBe(true)
  })

  it('rejects duplicate or stale payloads for the same stream', () => {
    const lastSeqByStream = new Map<string, number>()

    expect(
      shouldAcceptTerminalOutput(lastSeqByStream, 'term-1', {
        type: 'terminal.output',
        terminalId: 'term-1',
        streamId: 'terminal:term-1',
        seq: 0,
        replay: true,
        data: 'prompt',
      }),
    ).toBe(true)

    expect(
      shouldAcceptTerminalOutput(lastSeqByStream, 'term-1', {
        type: 'terminal.output',
        terminalId: 'term-1',
        streamId: 'terminal:term-1',
        seq: 0,
        replay: true,
        data: 'prompt',
      }),
    ).toBe(false)

    expect(
      shouldAcceptTerminalOutput(lastSeqByStream, 'term-1', {
        type: 'terminal.output',
        terminalId: 'term-1',
        streamId: 'terminal:term-1',
        seq: 1,
        data: 'next',
      }),
    ).toBe(true)

    expect(
      shouldAcceptTerminalOutput(lastSeqByStream, 'term-1', {
        type: 'terminal.output',
        terminalId: 'term-1',
        streamId: 'terminal:term-1',
        seq: 1,
        data: 'duplicate',
      }),
    ).toBe(false)
  })

  it('rejects output beyond a completed command boundary', () => {
    const lastSeqByStream = new Map<string, number>()
    const acceptWithBoundary = shouldAcceptTerminalOutput as unknown as (
      lastSeqByStream: Map<string, number>,
      terminalId: string,
      payload: Parameters<typeof shouldAcceptTerminalOutput>[2],
      outputEndOffset: number,
    ) => boolean

    expect(
      acceptWithBoundary(lastSeqByStream, 'term-1', {
        type: 'terminal.output',
        terminalId: 'term-1',
        streamId: 'terminal:term-1',
        seq: 1,
        outputOffset: 3,
        data: 'later command output',
      }, 2),
    ).toBe(false)
  })

  it('rejects replay arriving after newer live output', () => {
    const lastSeqByStream = new Map<string, number>()

    expect(
      shouldAcceptTerminalOutput(lastSeqByStream, 'term-1', {
        type: 'terminal.output',
        terminalId: 'term-1',
        streamId: 'terminal:term-1',
        seq: 2,
        data: 'live',
      }),
    ).toBe(true)

    expect(
      shouldAcceptTerminalOutput(lastSeqByStream, 'term-1', {
        type: 'terminal.output',
        terminalId: 'term-1',
        streamId: 'terminal:term-1',
        seq: 2,
        replay: true,
        data: 'stale replay',
      }),
    ).toBe(false)
  })
})
