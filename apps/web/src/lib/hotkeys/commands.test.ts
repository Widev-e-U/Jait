import { describe, expect, it } from 'vitest'

import {
  DEFAULT_HOTKEY_BINDINGS,
  HOTKEY_CATEGORIES,
  HOTKEY_COMMANDS,
  commandMatchesQuery,
  getCommandsByCategory,
  getHotkeyCommand,
  isHotkeyCommandId,
} from './commands'
import { normalizeChord } from './keys'

/** Combos browsers own and refuse to hand over — never ship these as defaults. */
const BROWSER_RESERVED = [
  'mod+n', 'mod+t', 'mod+w', 'mod+q',
  'mod+shift+n', 'mod+shift+t', 'mod+shift+w', 'mod+shift+a', 'mod+shift+r',
  'mod+1', 'mod+2', 'mod+3', 'mod+4', 'mod+5', 'mod+6', 'mod+7', 'mod+8', 'mod+9',
]

describe('hotkey command catalogue', () => {
  it('has unique ids', () => {
    const ids = HOTKEY_COMMANDS.map((command) => command.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('declares every command under a known category', () => {
    const categories = new Set(HOTKEY_CATEGORIES.map((category) => category.id))
    for (const command of HOTKEY_COMMANDS) {
      expect(categories.has(command.category)).toBe(true)
    }
  })

  it('ships only canonical default chords', () => {
    for (const command of HOTKEY_COMMANDS) {
      if (command.defaultBinding === null) continue
      expect(normalizeChord(command.defaultBinding)).toBe(command.defaultBinding)
    }
  })

  it('assigns each default chord to at most one command', () => {
    const seen = new Map<string, string>()
    for (const [id, chord] of Object.entries(DEFAULT_HOTKEY_BINDINGS)) {
      if (!chord) continue
      expect(seen.get(chord), `${chord} is claimed twice`).toBeUndefined()
      seen.set(chord, id)
    }
  })

  it('avoids combos the browser will not release', () => {
    for (const [id, chord] of Object.entries(DEFAULT_HOTKEY_BINDINGS)) {
      expect(BROWSER_RESERVED, `${id} uses a reserved combo`).not.toContain(chord)
    }
  })

  it('resolves commands by id', () => {
    expect(getHotkeyCommand('app.settings')?.defaultBinding).toBe('mod+,')
    expect(getHotkeyCommand('nope.nope')).toBeNull()
    expect(isHotkeyCommandId('chat.new')).toBe(true)
    expect(isHotkeyCommandId('chat.nope')).toBe(false)
  })

  it('groups commands by category in declaration order', () => {
    const navigation = getCommandsByCategory('navigation')
    expect(navigation.length).toBeGreaterThan(0)
    expect(navigation.every((command) => command.category === 'navigation')).toBe(true)
    expect(navigation[0].id).toBe('view.chat')
  })
})

describe('commandMatchesQuery', () => {
  const command = getHotkeyCommand('app.settings')!

  it('matches label, id and keywords case-insensitively', () => {
    expect(commandMatchesQuery(command, 'SETTINGS')).toBe(true)
    expect(commandMatchesQuery(command, 'preferences')).toBe(true)
    expect(commandMatchesQuery(command, 'app.set')).toBe(true)
  })

  it('matches everything for an empty query and nothing unrelated', () => {
    expect(commandMatchesQuery(command, '   ')).toBe(true)
    expect(commandMatchesQuery(command, 'terminal')).toBe(false)
  })
})
