import { describe, expect, it } from 'vitest'

import { DEFAULT_HOTKEY_BINDINGS } from './commands'
import {
  HOTKEY_STORAGE_KEY,
  buildHotkeyIndex,
  clearHotkeyOverride,
  findConflictingCommands,
  findHotkeyConflicts,
  parseHotkeyOverrides,
  readHotkeyOverrides,
  resolveHotkeyBindings,
  setHotkeyOverride,
  writeHotkeyOverrides,
  type HotkeyStorageLike,
} from './storage'

function memoryStorage(initial: Record<string, string> = {}): HotkeyStorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}

describe('parseHotkeyOverrides', () => {
  it('keeps known ids and normalizes their chords', () => {
    expect(parseHotkeyOverrides('{"chat.new":"Ctrl+Shift+K"}')).toEqual({ 'chat.new': 'ctrl+shift+k' })
  })

  it('preserves an explicit unbind', () => {
    expect(parseHotkeyOverrides('{"chat.new":null}')).toEqual({ 'chat.new': null })
  })

  it('drops unknown ids, bad chords and malformed payloads', () => {
    expect(parseHotkeyOverrides('{"nope":"mod+k","chat.new":"mod+bogus"}')).toEqual({})
    expect(parseHotkeyOverrides('not json')).toEqual({})
    expect(parseHotkeyOverrides('[1,2]')).toEqual({})
    expect(parseHotkeyOverrides(null)).toEqual({})
  })
})

describe('read/write overrides', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage()
    writeHotkeyOverrides({ 'chat.new': 'mod+shift+k' }, storage)
    expect(readHotkeyOverrides(storage)).toEqual({ 'chat.new': 'mod+shift+k' })
  })

  it('removes the entry when nothing is customised', () => {
    const storage = memoryStorage({ [HOTKEY_STORAGE_KEY]: '{"chat.new":"mod+shift+k"}' })
    writeHotkeyOverrides({}, storage)
    expect(storage.data.has(HOTKEY_STORAGE_KEY)).toBe(false)
  })

  it('is a no-op without storage', () => {
    expect(readHotkeyOverrides(null)).toEqual({})
    expect(() => writeHotkeyOverrides({ 'chat.new': 'mod+k' }, null)).not.toThrow()
  })
})

describe('resolveHotkeyBindings', () => {
  it('falls back to the defaults', () => {
    const bindings = resolveHotkeyBindings({})
    expect(bindings['app.settings']).toBe(DEFAULT_HOTKEY_BINDINGS['app.settings'])
  })

  it('applies overrides, including explicit unbinds', () => {
    const bindings = resolveHotkeyBindings({ 'chat.new': 'mod+shift+k', 'app.settings': null })
    expect(bindings['chat.new']).toBe('mod+shift+k')
    expect(bindings['app.settings']).toBeNull()
  })
})

describe('setHotkeyOverride', () => {
  it('stores a normalized chord', () => {
    expect(setHotkeyOverride({}, 'chat.new', 'Ctrl+Shift+K')).toEqual({ 'chat.new': 'ctrl+shift+k' })
  })

  it('drops the override when the value equals the default', () => {
    const overrides = setHotkeyOverride({}, 'chat.new', 'mod+shift+k')
    expect(setHotkeyOverride(overrides, 'chat.new', DEFAULT_HOTKEY_BINDINGS['chat.new']!)).toEqual({})
  })

  it('records an explicit unbind', () => {
    expect(setHotkeyOverride({}, 'chat.new', null)).toEqual({ 'chat.new': null })
  })

  it('ignores an unparseable chord', () => {
    const overrides = { 'chat.new': 'mod+shift+k' } as const
    expect(setHotkeyOverride(overrides, 'chat.new', 'mod+bogus')).toBe(overrides)
  })

  it('clearHotkeyOverride restores the default', () => {
    const overrides = setHotkeyOverride({}, 'chat.new', 'mod+shift+k')
    expect(clearHotkeyOverride(overrides, 'chat.new')).toEqual({})
    expect(clearHotkeyOverride({}, 'chat.new')).toEqual({})
  })
})

describe('conflict detection', () => {
  it('reports nothing for the shipped defaults', () => {
    expect(findHotkeyConflicts(resolveHotkeyBindings({})).size).toBe(0)
  })

  it('flags a chord claimed by two commands', () => {
    const bindings = resolveHotkeyBindings({ 'chat.new': DEFAULT_HOTKEY_BINDINGS['app.settings'] })
    const conflicts = findHotkeyConflicts(bindings)
    expect(conflicts.get('mod+,')).toEqual(['app.settings', 'chat.new'])
    expect(findConflictingCommands(bindings, 'chat.new', 'mod+,')).toEqual(['app.settings'])
    expect(findConflictingCommands(bindings, 'chat.new', null)).toEqual([])
  })

  it('indexes chords to their commands and skips unbound ones', () => {
    const index = buildHotkeyIndex(resolveHotkeyBindings({ 'app.settings': null }))
    expect(index.has('mod+,')).toBe(false)
    expect(index.get('mod+b')).toEqual(['chat.toggleSidebar'])
  })
})
