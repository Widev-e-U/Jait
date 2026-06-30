import { describe, expect, it } from 'vitest'

import { resolveProjectActiveTerminalId } from './terminal-view'

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
