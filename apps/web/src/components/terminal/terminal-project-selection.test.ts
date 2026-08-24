import { describe, expect, it } from 'vitest'

import { resolveProjectActiveTerminalId, resolveProjectTerminalSelection } from './terminal-view'

describe('resolveProjectActiveTerminalId', () => {
  it('drops an active terminal that does not belong to the current project', () => {
    expect(resolveProjectActiveTerminalId('term-project-a', [
      { id: 'term-project-b' },
    ])).toBeNull()
  })

  it('keeps the active terminal when it is in the current project terminal list', () => {
    expect(resolveProjectActiveTerminalId('term-project-b', [
      { id: 'term-project-a' },
      { id: 'term-project-b' },
    ])).toBe('term-project-b')
  })
})

describe('resolveProjectTerminalSelection', () => {
  it('keeps a newly selected terminal instead of restoring the stale saved tab', () => {
    expect(resolveProjectTerminalSelection('term-new', 'term-saved', [
      { id: 'term-saved' },
      { id: 'term-new' },
    ])).toBe('term-new')
  })
})
