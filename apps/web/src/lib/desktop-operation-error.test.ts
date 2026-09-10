import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { desktopOperationError } from './desktop-operation-error'

describe('desktopOperationError', () => {
  it('preserves the message of errors crossing the Electron context bridge', () => {
    const error: unknown = runInNewContext('new Error("Could not register shortcut")')
    expect(error).not.toBeInstanceOf(Error)
    expect(desktopOperationError(error, 'Tool execution failed')).toBe('Could not register shortcut')
  })
  it('preserves a string rejection', () => {
    expect(desktopOperationError('Desktop disconnected', 'Tool execution failed')).toBe('Desktop disconnected')
  })
  it('uses the fallback for empty or unrecognizable errors', () => {
    for (const error of [null, undefined, {}, { message: '' }]) {
      expect(desktopOperationError(error, 'Tool execution failed')).toBe('Tool execution failed')
    }
  })
})
