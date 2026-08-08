import { describe, expect, it } from 'vitest'

import {
  chordCandidatesFromEvent,
  chordFromEvent,
  chordMatchesEvent,
  formatChord,
  formatChordParts,
  formatEventModifierParts,
  isModifierOnlyEvent,
  normalizeChord,
  normalizeKeyToken,
  parseChord,
  type HotkeyEventLike,
} from './keys'

function keyEvent(overrides: Partial<HotkeyEventLike> & { key: string }): HotkeyEventLike {
  return { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...overrides }
}

describe('normalizeChord', () => {
  it('orders modifiers canonically regardless of input order', () => {
    expect(normalizeChord('Shift+Alt+Mod+P')).toBe('mod+alt+shift+p')
    expect(normalizeChord('mod+alt+shift+p')).toBe('mod+alt+shift+p')
  })

  it('accepts common modifier aliases', () => {
    expect(normalizeChord('Cmd+K')).toBe('meta+k')
    expect(normalizeChord('Control+K')).toBe('ctrl+k')
    expect(normalizeChord('Option+K')).toBe('alt+k')
  })

  it('normalizes named keys and their aliases', () => {
    expect(normalizeChord('Shift+Escape')).toBe('shift+escape')
    expect(normalizeChord('mod+ArrowUp')).toBe('mod+up')
    expect(normalizeChord('Esc')).toBe('escape')
    expect(normalizeChord('mod+Comma')).toBe('mod+,')
  })

  it('treats "+" as a bindable key', () => {
    expect(normalizeChord('+')).toBe('+')
    expect(normalizeChord('mod++')).toBe('mod++')
  })

  it('rejects modifier-only, empty and multi-key input', () => {
    expect(normalizeChord('mod')).toBeNull()
    expect(normalizeChord('   ')).toBeNull()
    expect(normalizeChord('mod+a+b')).toBeNull()
    expect(normalizeChord('mod+nonsense')).toBeNull()
    expect(normalizeChord(null)).toBeNull()
  })

  it('keeps function keys intact', () => {
    expect(normalizeChord('F5')).toBe('f5')
    expect(normalizeChord('mod+shift+F12')).toBe('mod+shift+f12')
    expect(normalizeChord('f25')).toBeNull()
  })
})

describe('normalizeKeyToken', () => {
  it('rejects bare modifier names', () => {
    for (const modifier of ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock']) {
      expect(normalizeKeyToken(modifier)).toBeNull()
    }
  })
})

describe('parseChord', () => {
  it('splits modifiers from the key', () => {
    expect(parseChord('mod+shift+o')).toEqual({ modifiers: ['mod', 'shift'], key: 'o' })
    expect(parseChord('alt+1')).toEqual({ modifiers: ['alt'], key: '1' })
  })

  it('handles the plus key', () => {
    expect(parseChord('mod++')).toEqual({ modifiers: ['mod'], key: '+' })
    expect(parseChord('+')).toEqual({ modifiers: [], key: '+' })
  })
})

describe('chordFromEvent', () => {
  it('maps ctrl to "mod" off macOS and meta to "mod" on macOS', () => {
    expect(chordFromEvent(keyEvent({ key: ',', ctrlKey: true }), false)).toBe('mod+,')
    expect(chordFromEvent(keyEvent({ key: ',', metaKey: true }), true)).toBe('mod+,')
  })

  it('keeps the non-primary modifier distinct', () => {
    expect(chordFromEvent(keyEvent({ key: 'k', metaKey: true }), false)).toBe('meta+k')
    expect(chordFromEvent(keyEvent({ key: 'k', ctrlKey: true }), true)).toBe('ctrl+k')
  })

  it('lowercases letters and resolves named keys', () => {
    expect(chordFromEvent(keyEvent({ key: 'O', ctrlKey: true, shiftKey: true }), false)).toBe('mod+shift+o')
    expect(chordFromEvent(keyEvent({ key: 'Escape', shiftKey: true }), false)).toBe('shift+escape')
  })

  it('returns null for a bare modifier press', () => {
    expect(chordFromEvent(keyEvent({ key: 'Shift', shiftKey: true }), false)).toBeNull()
    expect(isModifierOnlyEvent(keyEvent({ key: 'Control', ctrlKey: true }))).toBe(true)
  })

  it('falls back to the physical code when the key is unidentified', () => {
    expect(chordFromEvent(keyEvent({ key: 'Unidentified', code: 'KeyB', ctrlKey: true }), false)).toBe('mod+b')
  })
})

describe('chordCandidatesFromEvent', () => {
  it('offers both the layout key and the physical key', () => {
    const event = keyEvent({ key: '?', code: 'Slash', ctrlKey: true, shiftKey: true })
    expect(chordCandidatesFromEvent(event, false)).toEqual(['mod+shift+?', 'mod+shift+/'])
  })

  it('deduplicates when both derivations agree', () => {
    const event = keyEvent({ key: 'b', code: 'KeyB', ctrlKey: true })
    expect(chordCandidatesFromEvent(event, false)).toEqual(['mod+b'])
  })
})

describe('chordMatchesEvent', () => {
  it('matches through the physical-key fallback', () => {
    // German layout: "/" is Shift+7, so event.key is "/" but the code is Digit7.
    const event = keyEvent({ key: '/', code: 'Digit7', ctrlKey: true, shiftKey: true })
    expect(chordMatchesEvent('mod+shift+/', event, false)).toBe(true)
    expect(chordMatchesEvent('mod+shift+7', event, false)).toBe(true)
    expect(chordMatchesEvent('mod+shift+8', event, false)).toBe(false)
  })

  it('does not match when a modifier differs', () => {
    const event = keyEvent({ key: 'b', code: 'KeyB', ctrlKey: true })
    expect(chordMatchesEvent('mod+shift+b', event, false)).toBe(false)
  })
})

describe('formatChordParts', () => {
  it('uses symbols on macOS and words elsewhere', () => {
    expect(formatChordParts('mod+shift+o', true)).toEqual(['⌘', '⇧', 'O'])
    expect(formatChordParts('mod+shift+o', false)).toEqual(['Ctrl', 'Shift', 'O'])
  })

  it('labels named keys readably', () => {
    expect(formatChordParts('shift+escape', false)).toEqual(['Shift', 'Esc'])
    expect(formatChordParts('alt+up', false)).toEqual(['Alt', '↑'])
  })

  it('returns nothing for an unbound or invalid chord', () => {
    expect(formatChordParts(null, false)).toEqual([])
    expect(formatChordParts('mod', false)).toEqual([])
    expect(formatChord(null, false)).toBe('')
  })

  it('joins with "+" off macOS only', () => {
    expect(formatChord('mod+shift+o', true)).toBe('⌘⇧O')
    expect(formatChord('mod+shift+o', false)).toBe('Ctrl+Shift+O')
  })
})

describe('formatEventModifierParts', () => {
  it('previews only the held modifiers', () => {
    const event = keyEvent({ key: 'Shift', ctrlKey: true, shiftKey: true })
    expect(formatEventModifierParts(event, false)).toEqual(['Ctrl', 'Shift'])
    expect(formatEventModifierParts(event, true)).toEqual(['⌃', '⇧'])
  })
})
