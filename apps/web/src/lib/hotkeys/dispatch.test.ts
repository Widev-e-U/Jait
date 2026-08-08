import { describe, expect, it } from 'vitest'

import { isEditableTarget, resolveHotkeyCommands } from './dispatch'
import type { HotkeyEventLike } from './keys'
import { buildHotkeyIndex, resolveHotkeyBindings } from './storage'

const index = buildHotkeyIndex(resolveHotkeyBindings({}))

function keyEvent(overrides: Partial<HotkeyEventLike> & { key: string }): HotkeyEventLike {
  return { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...overrides }
}

describe('isEditableTarget', () => {
  it('detects text inputs, textareas and selects', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'input', type: 'search' })).toBe(true)
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true)
  })

  it('ignores non-text inputs and ordinary elements', () => {
    expect(isEditableTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableTarget({ tagName: 'DIV', closest: () => null })).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })

  it('detects rich editing surfaces', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV', getAttribute: () => 'true' })).toBe(true)
    expect(isEditableTarget({ tagName: 'SPAN', closest: () => ({}) })).toBe(true)
  })
})

describe('resolveHotkeyCommands', () => {
  it('resolves a bound chord to its command', () => {
    const event = keyEvent({ key: ',', code: 'Comma', ctrlKey: true })
    expect(resolveHotkeyCommands(index, event, { mac: false })).toEqual(['app.settings'])
  })

  it('returns nothing for an unbound combo', () => {
    const event = keyEvent({ key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true })
    expect(resolveHotkeyCommands(index, event, { mac: false })).toEqual([])
  })

  it('suppresses input-unsafe commands while typing', () => {
    const event = keyEvent({ key: 'e', code: 'KeyE', ctrlKey: true, shiftKey: true })
    expect(resolveHotkeyCommands(index, event, { mac: false })).toEqual(['workspace.toggleEditor'])
    expect(resolveHotkeyCommands(index, event, { mac: false, editableTarget: true })).toEqual([])
  })

  it('still fires input-safe commands while typing', () => {
    const event = keyEvent({ key: 'b', code: 'KeyB', ctrlKey: true })
    expect(resolveHotkeyCommands(index, event, { mac: false, editableTarget: true })).toEqual(['chat.toggleSidebar'])
  })

  it('uses the platform accelerator', () => {
    const macEvent = keyEvent({ key: 'b', code: 'KeyB', metaKey: true })
    expect(resolveHotkeyCommands(index, macEvent, { mac: true })).toEqual(['chat.toggleSidebar'])
    expect(resolveHotkeyCommands(index, macEvent, { mac: false })).toEqual([])
  })

  it('lists every command sharing a chord', () => {
    const conflicted = buildHotkeyIndex(resolveHotkeyBindings({ 'chat.new': 'mod+,' }))
    const event = keyEvent({ key: ',', code: 'Comma', ctrlKey: true })
    expect(resolveHotkeyCommands(conflicted, event, { mac: false })).toEqual(['app.settings', 'chat.new'])
  })
})
